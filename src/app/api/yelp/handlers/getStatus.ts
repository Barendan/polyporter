import { NextResponse } from 'next/server';
import { hexagonProcessor } from '@/lib/hexagons/processor';
import { yelpQuotaManager } from '@/lib/utils/quotaManager';
import { yelpRateLimiter } from '@/lib/yelp/rateLimiter';
import { processingStates, type ProcessingState } from './state';

/**
 * Get current processing status
 * Returns processing stats, quota status, and progress information
 */
export async function getStatus(): Promise<NextResponse> {
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

