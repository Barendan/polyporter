// API endpoint for bulk updating staging restaurant statuses
import { NextRequest, NextResponse } from 'next/server';
import { bulkUpdateStagingStatus } from '@/lib/database/yelpStaging';
import type { YelpStagingStatus } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { yelpIds, status } = body;

    // Input validation
    if (!yelpIds || !Array.isArray(yelpIds) || yelpIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid yelpIds: must be a non-empty array'
        },
        { status: 400 }
      );
    }

    if (!status || typeof status !== 'string') {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid status: must be a string'
        },
        { status: 400 }
      );
    }

    // Validate status is one of the allowed values
    const validStatuses: YelpStagingStatus[] = ['approved', 'rejected'];
    if (!validStatuses.includes(status as YelpStagingStatus)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid status: "${status}". Must be one of: ${validStatuses.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Validate all IDs are strings
    const invalidIds = yelpIds.filter(id => typeof id !== 'string' || id.trim().length === 0);
    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid IDs found: ${invalidIds.length} IDs are not valid strings`
        },
        { status: 400 }
      );
    }

    // Perform bulk update
    const result = await bulkUpdateStagingStatus(
      yelpIds.map((id: string) => id.trim()),
      status as YelpStagingStatus
    );

    if (result.successCount > 0) {
      return NextResponse.json({
        success: true,
        message: `Successfully updated ${result.successCount} restaurant${result.successCount === 1 ? '' : 's'} to ${status}`,
        successCount: result.successCount,
        failedCount: result.failedCount,
        failedIds: result.failedIds
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: `Failed to update any restaurants. All ${result.failedCount} restaurant${result.failedCount === 1 ? '' : 's'} may not exist in database.`,
          successCount: result.successCount,
          failedCount: result.failedCount,
          failedIds: result.failedIds
        },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('❌ Exception in POST /api/yelp/staging/bulk-update-status:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error while bulk updating restaurant statuses'
      },
      { status: 500 }
    );
  }
}

