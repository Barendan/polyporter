// API endpoint for bulk creating staging restaurants (for approved restaurants)
import { NextRequest, NextResponse } from 'next/server';
import { batchCreateYelpStaging } from '@/lib/database/yelpStaging';
import type { YelpBusiness } from '@/lib/yelp/search';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { restaurants, h3Id, cityId, importLogId } = body;

    // Input validation
    if (!restaurants || !Array.isArray(restaurants) || restaurants.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid restaurants: must be a non-empty array'
        },
        { status: 400 }
      );
    }

    if (!h3Id || typeof h3Id !== 'string' || h3Id.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid h3Id: must be a non-empty string'
        },
        { status: 400 }
      );
    }

    if (!cityId || typeof cityId !== 'string' || cityId.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid cityId: must be a non-empty string'
        },
        { status: 400 }
      );
    }

    if (!importLogId || typeof importLogId !== 'string' || importLogId.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid importLogId: must be a non-empty string'
        },
        { status: 400 }
      );
    }

    // Validate all restaurants have required fields
    const invalidRestaurants = restaurants.filter(
      (r: any) => !r || !r.id || typeof r.id !== 'string' || r.id.trim().length === 0
    );
    if (invalidRestaurants.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid restaurants found: ${invalidRestaurants.length} restaurants are missing required fields (id)`
        },
        { status: 400 }
      );
    }

    // Convert restaurants to YelpBusiness format (they should already be in this format)
    const yelpBusinesses: YelpBusiness[] = restaurants as YelpBusiness[];

    // Create staging records
    const result = await batchCreateYelpStaging(
      yelpBusinesses,
      h3Id.trim(),
      cityId.trim(),
      importLogId.trim()
    );

    if (result.createdCount > 0) {
      return NextResponse.json({
        success: true,
        message: `Successfully created ${result.createdCount} restaurant${result.createdCount === 1 ? '' : 's'} in staging`,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        newBusinesses: result.newBusinesses
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: `Failed to create any restaurants. ${result.skippedCount} duplicates, ${result.errorCount} validation errors`,
          createdCount: result.createdCount,
          skippedCount: result.skippedCount,
          errorCount: result.errorCount
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('❌ Exception in POST /api/yelp/staging/bulk-create:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error while creating staging restaurants'
      },
      { status: 500 }
    );
  }
}

