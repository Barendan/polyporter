import { NextResponse } from 'next/server';
import { yelpQuotaManager } from '@/lib/utils/quotaManager';

/**
 * Get quota status and recommendations
 * Returns current quota usage, trends, and detailed report
 */
export async function getQuota(): Promise<NextResponse> {
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

