import { NextResponse } from 'next/server';
import { checkCacheStatus } from '@/lib/database/cacheLoader';

/**
 * Check if city has cached restaurant data
 * Returns cache status information
 */
export async function checkCache(searchParams: URLSearchParams): Promise<NextResponse> {
  try {
    const cityId = searchParams.get('city_id');
    
    if (!cityId || cityId.trim() === '') {
      return NextResponse.json(
        { error: 'city_id parameter is required' },
        { status: 400 }
      );
    }
    
    const cacheStatus = await checkCacheStatus(cityId);
    
    return NextResponse.json({
      ...cacheStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking cache status:', error);
    return NextResponse.json(
      { error: 'Failed to check cache status' },
      { status: 500 }
    );
  }
}

