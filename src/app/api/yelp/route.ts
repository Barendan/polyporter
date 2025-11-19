// Yelp API Route - Action router for Yelp search operations
import { NextRequest, NextResponse } from 'next/server';
import { processHexagons } from './handlers/processHexagons';
import { getStatus } from './handlers/getStatus';
import { getQuota } from './handlers/getQuota';
import { loadCache } from './handlers/loadCache';
import { checkCache } from './handlers/checkCache';

/**
 * POST /api/yelp
 * Handles Yelp search operations via action-based routing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, hexagons, cityName, testMode, city_id } = body;

    switch (action) {
      case 'process_hexagons':
        return await processHexagons(hexagons, testMode, cityName);
      
      case 'get_processing_status':
        return await getStatus();
      
      case 'get_quota_status':
        return await getQuota();
      
      case 'load_cached':
        return await loadCache(city_id);
      
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Yelp API error:', error);
    return NextResponse.json(
      { error: 'Failed to process Yelp request' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/yelp
 * Handles status and quota checks via query parameters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'status':
        return await getStatus();
      
      case 'quota':
        return await getQuota();
      
      case 'check_cache':
        return await checkCache(searchParams);
      
      default:
        return NextResponse.json({
          message: 'Yelp API endpoint',
          availableActions: ['status', 'quota', 'check_cache'],
          timestamp: new Date().toISOString()
        });
    }

  } catch (error) {
    console.error('Yelp API GET error:', error);
    return NextResponse.json(
      { error: 'Failed to process GET request' },
      { status: 500 }
    );
  }
}
