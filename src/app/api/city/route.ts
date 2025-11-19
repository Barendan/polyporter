import { NextRequest, NextResponse } from 'next/server';
import type { CityResponse, EnhancedCityResponse } from '@/lib/geography/cityTypes';
import { 
  selectBestBoundary, 
  osmRelationToGeoJSON, 
  calculateBBox,
  createEnhancedCityResponse
} from '@/lib/geography/cityUtils';
import { executeOverpassStrategies } from '@/lib/geography/overpassClient';
import { fetchCityFromNominatim } from '@/lib/geography/nominatimClient';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { getCityWithPolygon, createCity, upsertPolygonZone } from '@/lib/database/cities';
import { dbToEnhancedCityResponse, parseCityInput } from '@/lib/database/cityConverter';
import { checkCacheStatus } from '@/lib/database/cacheLoader';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cityName = searchParams.get('name');

  if (!cityName || cityName.trim() === '') {
    return NextResponse.json(
      { error: 'City name is required' },
      { status: 400 }
    );
  }

  try {
    // STEP 1: Check Supabase cache first (graceful degradation - if DB fails, continue normally)
    const parsed = parseCityInput(cityName.trim());
    if (parsed) {
      try {
        const cached = await getCityWithPolygon(parsed.cityName, parsed.state);
        if (cached) {
          const enhancedFromCache = dbToEnhancedCityResponse(cached.city, cached.polygonZone);
          if (enhancedFromCache) {
            // Add cache status for restaurant data
            await addCacheStatusToResponse(enhancedFromCache, cached.city.id);
            return NextResponse.json(enhancedFromCache);
          }
        }
      } catch (dbError) {
        // Graceful degradation: if DB check fails, continue with normal flow
        console.error('BIG: Database check failed:', dbError);
      }
    }

    // STEP 2: If not in cache, fetch from external APIs (existing logic)
    // Try Nominatim API first (default)
    const nominatimResult = await fetchCityFromNominatim(cityName.trim());
    console.log('nominatim did it....', cityName.trim());
    if (nominatimResult) {
      // Create enhanced response with buffered polygon and H3 grid
      const enhancedResult = createEnhancedCityResponse(nominatimResult);
      
      // STEP 3: Save to cache (graceful degradation - if save fails, still return result)
      const cityId = await saveCityToCache(enhancedResult, nominatimResult.source, cityName.trim());
      
      // Add cache status for restaurant data
      if (cityId) {
        await addCacheStatusToResponse(enhancedResult, cityId);
      }
      
      return NextResponse.json(enhancedResult);
    }

    // Fallback to Overpass if Nominatim fails
    const overpassResult = await tryOverpassAPI(cityName.trim());
    if (overpassResult) {
      // Create enhanced response with buffered polygon and H3 grid
      const enhancedResult = createEnhancedCityResponse(overpassResult);
      
      // STEP 3: Save to cache (graceful degradation - if save fails, still return result)
      const cityId = await saveCityToCache(enhancedResult, overpassResult.source, cityName.trim());
      
      // Add cache status for restaurant data
      if (cityId) {
        await addCacheStatusToResponse(enhancedResult, cityId);
      }
      
      return NextResponse.json(enhancedResult);
    }

    return NextResponse.json(
      { error: 'No boundary found for this city' },
      { status: 404 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch city data. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * Add restaurant cache status to enhanced city response
 * Mutates the response object to add cache metadata
 */
async function addCacheStatusToResponse(
  enhancedResult: EnhancedCityResponse,
  cityId: string
): Promise<void> {
  try {
    const cacheStatus = await checkCacheStatus(cityId);
    
    // Add cache metadata to response
    (enhancedResult as any).city_id = cityId;
    (enhancedResult as any).cachedRestaurantData = {
      available: cacheStatus.hasCachedData,
      count: cacheStatus.estimatedRestaurants,
      hexagonCount: cacheStatus.hexagonCount
    };
  } catch (error) {
    // Fail silently - don't break response if cache check fails
    console.warn('Failed to check restaurant cache status (non-fatal):', error);
  }
}

/**
 * Save city data to Supabase cache
 * This function fails silently to ensure graceful degradation
 * Returns the city_id if successful, null otherwise
 */
async function saveCityToCache(
  enhancedResult: EnhancedCityResponse,
  source: 'overpass' | 'nominatim',
  originalInput: string
): Promise<string | null> {
  try {
    // Use original input for parsing (more reliable than display name)
    let parsed = parseCityInput(originalInput);
    
    // If original input doesn't parse, try parsing from enhanced result name
    if (!parsed) {
      parsed = parseCityInput(enhancedResult.name);
    }
    
    // If still can't parse, try extracting from name parts
    if (!parsed) {
      const parts = enhancedResult.name.includes(', ') 
        ? enhancedResult.name.split(', ')
        : enhancedResult.name.includes(',')
        ? enhancedResult.name.split(',').map(p => p.trim())
        : null;
      if (parts && parts.length >= 2) {
        const { normalizeStateCode, normalizeCityName } = await import('@/lib/utils/stateNormalizer');
        parsed = {
          cityName: normalizeCityName(parts[0]),
          state: normalizeStateCode(parts[1])
        };
      } else {
        return null;
      }
    }

    // Calculate polygon area if possible
    const polygonArea = enhancedResult.grid_stats?.coverage_area_km2;

    // Create or get city record
    let cityId = await createCity({
      name: parsed.cityName,
      state: parsed.state,
      country: 'USA', // Default to USA, could be enhanced to detect country
      polygon_area_km2: polygonArea
    });

    if (!cityId) {
      // City might already exist, try to get it
      const existingCity = await getCityWithPolygon(parsed.cityName, parsed.state);
      if (existingCity) {
        cityId = existingCity.city.id;
      } else {
        return null;
      }
    }

    // Save polygon zone
    // Map 'nominatim' to 'osm' since database enum only accepts 'overpass' | 'osm'
    // Nominatim is an OSM-based service, so 'osm' is the correct value
    const dbSource: 'overpass' | 'osm' = source === 'nominatim' ? 'osm' : source;
    
    await upsertPolygonZone({
      city_id: cityId,
      source: dbSource,
      raw_polygon: enhancedResult.geojson,
      buffered_polygon: enhancedResult.buffered_polygon,
      bbox: enhancedResult.bbox
    });

    return cityId;

  } catch (error) {
    // Fail silently - don't break the API if caching fails
    return null;
  }
}

async function tryOverpassAPI(cityName: string): Promise<CityResponse | null> {
  // Extract state code from city input
  const parts = cityName.split(', ');
  if (parts.length !== 2) {
    return null;
  }
  
  const cityNameOnly = parts[0].trim();
  const stateCode = parts[1].trim();
  
  try {
    // Execute our three working Overpass strategies
    const overpassResult = await executeOverpassStrategies(cityName, stateCode);
    
    if (!overpassResult || !overpassResult.elements || overpassResult.elements.length === 0) {
      return null;
    }
    
    // Select the best boundary from the results
    const best = selectBestBoundary(overpassResult.elements);
    if (!best) {
      return null;
    }
    
    // Convert to GeoJSON
    const geojson = osmRelationToGeoJSON(best);
    
    // Calculate bounding box
    const bbox = calculateBBox(geojson);
    
    return {
      name: best.tags.name,
      bbox,
      geojson,
      osm_id: best.id,
      source: 'overpass'
    };
    
  } catch (error) {
    return null;
  }
}
