import { NextResponse } from 'next/server';
import { getCachedRestaurantData } from '@/lib/database/cacheLoader';

/**
 * Load cached restaurant data for a city
 * Returns cached hexagon results in the same format as process_hexagons
 */
export async function loadCache(cityId: string): Promise<NextResponse> {
  try {
    if (!cityId || cityId.trim() === '') {
      return NextResponse.json(
        { error: 'city_id is required' },
        { status: 400 }
      );
    }
    
    console.log(`📦 Loading cached restaurants for city: ${cityId}`);
    
    const cachedData = await getCachedRestaurantData(cityId);
    
    if (!cachedData) {
      return NextResponse.json(
        { error: 'No cached data found for this city' },
        { status: 404 }
      );
    }
    
    // Return data in the same format as process_hexagons
    // This ensures compatibility with existing frontend code
    return NextResponse.json({
      success: true,
      results: cachedData.hexagons,
      testMode: false,
      processedAt: cachedData.cacheDate,
      fromCache: true, // Flag to indicate this is cached data
      processingStats: {
        totalHexagons: cachedData.totalHexagons,
        processedHexagons: cachedData.totalHexagons,
        successfulHexagons: cachedData.totalHexagons,
        failedHexagons: 0,
        limitedHexagons: 0,
        totalRequested: cachedData.totalRestaurants
      }
    });

  } catch (error) {
    console.error('Error loading cached restaurants:', error);
    return NextResponse.json(
      { error: 'Failed to load cached restaurants' },
      { status: 500 }
    );
  }
}

