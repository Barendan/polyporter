import { NextRequest, NextResponse } from 'next/server';
import type { CityResponse, EnhancedCityResponse } from '@/shared/geography/cityTypes';
import { 
  selectBestBoundary, 
  osmRelationToGeoJSON, 
  calculateBBox,
  createEnhancedCityResponse
} from '@/shared/geography/cityUtils';
import { executeOverpassStrategies } from '@/shared/geography/overpassClient';
import { fetchCityFromNominatim } from '@/shared/geography/nominatimClient';
import { getCityWithPolygon, createCity, upsertPolygonZone } from '@/shared/database/cities';
import { dbToEnhancedCityResponse, parseCityInput } from '@/shared/utils/cityNormalizer';
import { checkCacheStatus } from '@/shared/database/cacheLoader';

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
    // Generate a simple trace identifier for end-to-end logging
    const traceId = `city_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[${traceId}] /api/city input`, { raw: cityName });

    // STEP 1: Normalize input immediately (single source of truth)
    const parsed = parseCityInput(cityName.trim());
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid city format' }, { status: 400 });
    }
    
    // Create normalized query string for external APIs
    const normalizedQuery = `${parsed.cityName}, ${parsed.state}`;
    const cityQuery = normalizedQuery; // City query in "City, ST" format for downstream use

    console.log(`[${traceId}] /api/city parsed`, { parsed, cityQuery });
    
    // STEP 2: Check Supabase cache first (graceful degradation - if DB fails, continue normally)
    try {
      const cached = await getCityWithPolygon(parsed.cityName, parsed.state);
      if (cached) {
        const enhancedFromCache = dbToEnhancedCityResponse(cached.city, cached.polygonZone);
        if (enhancedFromCache) {
          // Add cache status for restaurant data
          const cacheData = await getCacheStatusData(cached.city.id);
          
          // Return new object with proper types (no mutation)
          const responseBody: EnhancedCityResponse = {
            ...enhancedFromCache,
            city_id: cached.city.id,
            city_query: cityQuery,
            ...(cacheData && { cachedRestaurantData: cacheData }),
            traceId
          };

          console.log(`[${traceId}] /api/city response (cached)`, {
            city_id: responseBody.city_id,
            city_query: responseBody.city_query,
            name: responseBody.name
          });
          
          return NextResponse.json(responseBody);
        }
      }
    } catch (dbError) {
      // Graceful degradation: if DB check fails, continue with normal flow
      console.error('BIG: Database check failed:', dbError);
    }

    // STEP 3: If not in cache, fetch from external APIs (use normalized query)
    // Try Nominatim API first (default)
    const nominatimResult = await fetchCityFromNominatim(normalizedQuery);
    console.log(`[${traceId}] /api/city nominatim did it`, { normalizedQuery });
    if (nominatimResult) {
      // Create enhanced response with buffered polygon and H3 grid
      const enhancedResult = createEnhancedCityResponse(nominatimResult);
      
      // STEP 4: Save to cache (graceful degradation - if save fails, still return result)
      const cityId = await saveCityToCache(
        enhancedResult,
        nominatimResult.source,
        normalizedQuery,
        parsed
      );
      
      console.log(`[${traceId}] /api/city cache result (nominatim)`, {
        cityId,
        city_query: cityQuery,
        enhanced_name: enhancedResult.name,
        hasH3: !!enhancedResult.h3_grid?.length
      });
      
      // Get cache status data when cityId is available
      const cacheData = cityId ? await getCacheStatusData(cityId) : null;
      
      // Return new object with proper types (no mutation)
      const responseBody: EnhancedCityResponse = {
        ...enhancedResult,
        city_id: cityId ?? null,
        city_query: cityQuery,
        ...(cacheData && { cachedRestaurantData: cacheData }),
        traceId
      };

      console.log(`[${traceId}] /api/city response (nominatim)`, {
        city_id: responseBody.city_id,
        city_query: responseBody.city_query,
        name: responseBody.name
      });
      
      return NextResponse.json(responseBody);
    }

    // Fallback to Overpass if Nominatim fails
    const overpassResult = await tryOverpassAPI(normalizedQuery);
    if (overpassResult) {
      // Create enhanced response with buffered polygon and H3 grid
      const enhancedResult = createEnhancedCityResponse(overpassResult);
      
      // STEP 4: Save to cache (graceful degradation - if save fails, still return result)
      const cityId = await saveCityToCache(
        enhancedResult,
        overpassResult.source,
        normalizedQuery,
        parsed
      );
      
      console.log(`[${traceId}] /api/city cache result (overpass)`, {
        cityId,
        city_query: cityQuery,
        enhanced_name: enhancedResult.name,
        hasH3: !!enhancedResult.h3_grid?.length
      });
      
      // Get cache status data when cityId is available
      const cacheData = cityId ? await getCacheStatusData(cityId) : null;
      
      // Return new object with proper types (no mutation)
      const responseBody: EnhancedCityResponse = {
        ...enhancedResult,
        city_id: cityId ?? null,
        city_query: cityQuery,
        ...(cacheData && { cachedRestaurantData: cacheData }),
        traceId
      };

      console.log(`[${traceId}] /api/city response (overpass)`, {
        city_id: responseBody.city_id,
        city_query: responseBody.city_query,
        name: responseBody.name
      });
      
      return NextResponse.json(responseBody);
    }

    return NextResponse.json(
      { error: 'No boundary found for this city' },
      { status: 404 }
    );
  } catch (_error) {
    return NextResponse.json(
      { error: 'Failed to fetch city data. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * Get restaurant cache status data (non-mutating helper)
 * Returns cache metadata object or null if check fails
 */
async function getCacheStatusData(cityId: string): Promise<{
  available: boolean;
  count: number;
  hexagonCount: number;
} | null> {
  try {
    const cacheStatus = await checkCacheStatus(cityId);
    return {
      available: cacheStatus.hasCachedData,
      count: cacheStatus.estimatedRestaurants,
      hexagonCount: cacheStatus.hexagonCount
    };
  } catch (error) {
    // Fail silently - don't break response if cache check fails
    console.warn('Failed to check restaurant cache status (non-fatal):', error);
    return null;
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
  originalInput: string,
  preParsed?: { cityName: string; state: string } | null  // ADD: Optional pre-parsed object
): Promise<string | null> {

  try {
    // Only use preParsed or originalInput - never parse enhancedResult.name (could be display_name)
    let parsed = preParsed || parseCityInput(originalInput);
    
    // If we still can't parse, fail gracefully
    if (!parsed) {
      console.error(`❌ Failed to parse city input in saveCityToCache: originalInput="${originalInput}", preParsed=${preParsed ? 'provided' : 'missing'}`);
      return null;
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

  } catch (_error) {
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
    
  } catch (_error) {
    return null;
  }
}
