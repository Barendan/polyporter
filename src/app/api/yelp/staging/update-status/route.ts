// API endpoint for updating a single staging restaurant status
import { NextRequest, NextResponse } from 'next/server';
import { updateStagingStatus } from '@/lib/database/yelpStaging';
import type { YelpStagingStatus } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { yelpId, status } = body;

    // Input validation
    if (!yelpId || typeof yelpId !== 'string' || yelpId.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid yelpId: must be a non-empty string'
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

    // Update the status
    const success = await updateStagingStatus(yelpId.trim(), status as YelpStagingStatus);

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Successfully updated restaurant status to ${status}`,
        yelpId: yelpId.trim()
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: `Failed to update restaurant status. Restaurant may not exist in database.`,
          yelpId: yelpId.trim()
        },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('❌ Exception in POST /api/yelp/staging/update-status:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error while updating restaurant status'
      },
      { status: 500 }
    );
  }
}

