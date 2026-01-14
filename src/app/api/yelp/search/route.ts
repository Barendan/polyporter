// Yelp Search API Route - Consolidated handler for Yelp search operations
import { NextRequest, NextResponse } from 'next/server';
import { processHexagons } from './processHexagons';
import { hexagonProcessor } from '@/lib/hexagons/processor';
import { yelpQuotaManager } from '@/lib/utils/quotaManager';
import { yelpRateLimiter } from '@/lib/yelp/rateLimiter';
import { getCachedRestaurantData, checkCacheStatus } from '@/lib/database/cacheLoader';
import { processingStates, type ProcessingState } from './state';

/**
 * POST /api/yelp/search
 * Handles Yelp search operations via action-based routing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, hexagons, cityName, testMode, city_id, traceId } = body;

    console.log('[yelp/search route] body', {
      traceId,
      action,
      city_id,
      cityName
    });

    switch (action) {
      case 'process_hexagons':
        return await processHexagons(hexagons, testMode, cityName, city_id);
      
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
    console.error('Yelp Search API error:', error);
    return NextResponse.json(
      { error: 'Failed to process Yelp search request' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/yelp/search
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
          message: 'Yelp Search API endpoint',
          availableActions: ['status', 'quota', 'check_cache'],
          timestamp: new Date().toISOString()
        });
    }

  } catch (error) {
    console.error('Yelp Search API GET error:', error);
    return NextResponse.json(
      { error: 'Failed to process GET request' },
      { status: 500 }
    );
  }
}

// ============================================================================
// INTERNAL HANDLER FUNCTIONS
// ============================================================================

/**
 * Get current processing status
 * Returns processing stats, quota status, and progress information
 */
async function getStatus(): Promise<NextResponse> {
  try {
    const processingStats = hexagonProcessor.getProcessingStats();
    const quotaStatus = yelpQuotaManager.getQuotaStatus();
    const rateLimitStatus = yelpRateLimiter.getQuotaStatus();

    // Get active processing state if any
    let activeState: ProcessingState | null = null;
    for (const state of processingStates.values()) {
      if (state.isProcessing) {
        activeState = state;
        break;
      }
    }

    return NextResponse.json({
      processingStats,
      quotaStatus,
      rateLimitStatus,
      progress: activeState ? {
        total: activeState.totalHexagons,
        processed: activeState.processedHexagons,
        remaining: activeState.totalHexagons - activeState.processedHexagons,
        phase1Total: activeState.phase1Total,
        phase1Processed: activeState.phase1Processed,
        phase2Total: activeState.phase2Total,
        phase2Processed: activeState.phase2Processed,
        currentPhase: activeState.phase1Processed < activeState.phase1Total ? 'phase1' : 'phase2',
        elapsedTime: activeState.startTime ? Math.floor((Date.now() - activeState.startTime) / 1000) : 0,
        estimatedTimeRemaining: activeState.startTime && activeState.processedHexagons > 0 
          ? Math.floor(((Date.now() - activeState.startTime) / activeState.processedHexagons) * (activeState.totalHexagons - activeState.processedHexagons) / 1000)
          : null,
        actualApiCalls: activeState.actualApiCalls,
        estimatedTotalApiCalls: activeState.estimatedTotalApiCalls,
        lastRestaurantCount: activeState.lastRestaurantCount
      } : null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting processing status:', error);
    return NextResponse.json(
      { error: 'Failed to get processing status' },
      { status: 500 }
    );
  }
}

/**
 * Get quota status and recommendations
 * Returns current quota usage, trends, and detailed report
 */
async function getQuota(): Promise<NextResponse> {
  try {
    const quotaStatus = yelpQuotaManager.getQuotaStatus();
    const usageTrends = yelpQuotaManager.getUsageTrends();
    const detailedReport = yelpQuotaManager.getDetailedReport();

    return NextResponse.json({
      quotaStatus,
      usageTrends,
      detailedReport,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting quota status:', error);
    return NextResponse.json(
      { error: 'Failed to get quota status' },
      { status: 500 }
    );
  }
}

/**
 * Load cached restaurant data for a city
 * Returns cached hexagon results in the same format as process_hexagons
 */
async function loadCache(cityId: string): Promise<NextResponse> {
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
      cityId: cityId, // Include cityId so import logs can be fetched
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

/**
 * Check if city has cached restaurant data
 * Returns cache status information
 */
async function checkCache(searchParams: URLSearchParams): Promise<NextResponse> {
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

