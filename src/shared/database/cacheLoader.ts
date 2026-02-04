// Database helper functions for loading cached restaurant data
import { supabaseServer } from '../config/supabaseServer';
import { getPolygonZone } from '@/shared/database/cities';
import { generateH3Grid } from '@/shared/geography/cityUtils';
import { getStagingBusinessesAsYelpBusinesses } from '@/features/yelp/data/yelpStaging';
import type { YelpBusiness } from '@/features/yelp/domain/search';

// Interface matching the HexagonResult structure used in the frontend
export interface CachedHexagonResult {
  h3Id: string;
  mapIndex?: number;
  status: 'fetched' | 'failed' | 'dense' | 'split';
  totalBusinesses: number;
  uniqueBusinesses: YelpBusiness[];
  searchResults: YelpBusiness[]; // For cached data, this is the same as uniqueBusinesses
  coverageQuality: string;
  error?: string;
}

export interface CachedRestaurantData {
  hexagons: CachedHexagonResult[];
  totalRestaurants: number;
  totalHexagons: number;
  cacheDate: string;
}

/**
 * Get cached restaurant data for a city
 * Returns structured data ready for frontend consumption
 * 
 * @param cityId - The city UUID to fetch cached data for
 * @returns Cached data or null if no data available
 */
async function getCityHexGrid(cityId: string): Promise<string[]> {
  try {
    const polygonZone = await getPolygonZone(cityId);
    if (!polygonZone) {
      console.warn(`⚠️ No polygon zone found for city: ${cityId}`);
      return [];
    }

    const polygon = (polygonZone.buffered_polygon || polygonZone.raw_polygon) as any;
    if (!polygon || !polygon.geometry) {
      console.warn(`⚠️ Invalid polygon data for city: ${cityId}`);
      return [];
    }

    return generateH3Grid(polygon, 7);
  } catch (error) {
    console.error('❌ Failed to generate city H3 grid:', error);
    return [];
  }
}

async function getCachedHextilesByH3Ids(h3Ids: string[]) {
  if (h3Ids.length === 0) return [];
  const batchSize = 200;
  const results: any[] = [];

  for (let i = 0; i < h3Ids.length; i += batchSize) {
    const batch = h3Ids.slice(i, i + batchSize);
    const { data, error } = await supabaseServer
      .from('yelp_hextiles')
      .select('*')
      .in('h3_id', batch)
      .in('status', ['fetched', 'dense']);

    if (error) {
      console.error('Error fetching hextiles by H3 IDs:', error);
      continue;
    }

    if (data && data.length > 0) {
      results.push(...data);
    }
  }

  return results;
}

export async function getCachedRestaurantData(cityId: string): Promise<CachedRestaurantData | null> {
  try {
    console.log(`📦 Loading cached restaurant data for city: ${cityId}`);

    // STEP 1: Build the city hex grid and fetch cached hextiles by H3 ID
    const cityHexGrid = await getCityHexGrid(cityId);
    if (cityHexGrid.length === 0) {
      console.log(`⚠️ No H3 grid available for city: ${cityId}`);
      return null;
    }

    const hextiles = await getCachedHextilesByH3Ids(cityHexGrid);
    
    if (!hextiles || hextiles.length === 0) {
      console.log(`⚠️ No cached hexagons found for city: ${cityId}`);
      return null;
    }

    console.log(`✅ Found ${hextiles.length} cached hexagons for city`);

    // STEP 2: For each hexagon, get the cached restaurants
    const hexagonResults: CachedHexagonResult[] = [];
    let totalRestaurantCount = 0;
    let oldestCacheDate = new Date();
    
    for (let i = 0; i < hextiles.length; i++) {
      const hextile = hextiles[i];
      
      try {
        // Get restaurants from staging table
        const restaurants = await getStagingBusinessesAsYelpBusinesses(hextile.h3_id, { includeRejected: true });
        
        // Skip hexagons with no restaurants (zombie hexagons from old system)
        if (restaurants.length === 0) {
          console.log(`⏭️ Skipping hexagon ${hextile.h3_id} - no restaurants found`);
          continue;
        }
        
        // Track oldest cache date
        const hexCreatedAt = new Date(hextile.created_at);
        if (hexCreatedAt < oldestCacheDate) {
          oldestCacheDate = hexCreatedAt;
        }
        
        // Create result matching frontend structure
        const hexagonResult: CachedHexagonResult = {
          h3Id: hextile.h3_id,
          mapIndex: i, // Sequential index for display
          status: hextile.status as 'fetched' | 'dense',
          totalBusinesses: restaurants.length,
          uniqueBusinesses: restaurants,
          searchResults: restaurants, // For cached data, these are the same
          coverageQuality: hextile.status === 'dense' ? 'dense' : 'good'
        };
        
        hexagonResults.push(hexagonResult);
        totalRestaurantCount += restaurants.length;
        
      } catch (hexError) {
        console.warn(`⚠️ Failed to load restaurants for hexagon ${hextile.h3_id}:`, hexError);
        // Continue with other hexagons even if one fails
      }
    }
    
    if (hexagonResults.length === 0) {
      console.log(`⚠️ No hexagons with restaurants found for city: ${cityId}`);
      return null;
    }
    
    console.log(`✅ Successfully loaded ${totalRestaurantCount} restaurants across ${hexagonResults.length} hexagons`);
    
    return {
      hexagons: hexagonResults,
      totalRestaurants: totalRestaurantCount,
      totalHexagons: hexagonResults.length,
      cacheDate: oldestCacheDate.toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error loading cached restaurant data:', error);
    return null;
  }
}

/**
 * Check if city has cached restaurant data
 * Lightweight query for status checking
 * 
 * @param cityId - The city UUID to check
 * @returns Cache status information
 */
export async function checkCacheStatus(cityId: string): Promise<{
  hasCachedData: boolean;
  hexagonCount: number;
  estimatedRestaurants: number;
}> {
  try {
    const cityHexGrid = await getCityHexGrid(cityId);
    if (cityHexGrid.length === 0) {
      return {
        hasCachedData: false,
        hexagonCount: 0,
        estimatedRestaurants: 0
      };
    }

    const batchSize = 200;
    let hexagonCount = 0;
    let estimatedRestaurants = 0;

    for (let i = 0; i < cityHexGrid.length; i += batchSize) {
      const batch = cityHexGrid.slice(i, i + batchSize);

      const { count: hexCount, error: hexError } = await supabaseServer
        .from('yelp_hextiles')
        .select('h3_id', { count: 'exact', head: true })
        .in('h3_id', batch)
        .in('status', ['fetched', 'dense']);

      if (hexError) {
        console.error('Error checking cache status:', hexError);
        continue;
      }

      hexagonCount += hexCount || 0;

      const { count: stagingCount, error: stagingError } = await supabaseServer
        .from('yelp_staging')
        .select('id', { count: 'exact', head: true })
        .in('h3_id', batch)
        .in('status', ['new', 'approved']);

      if (stagingError) {
        console.error('Error checking staging cache status:', stagingError);
        continue;
      }

      estimatedRestaurants += stagingCount || 0;
    }

    return {
      hasCachedData: hexagonCount > 0 && estimatedRestaurants > 0,
      hexagonCount,
      estimatedRestaurants
    };
    
  } catch (error) {
    console.error('Exception checking cache status:', error);
    return {
      hasCachedData: false,
      hexagonCount: 0,
      estimatedRestaurants: 0
    };
  }
}

