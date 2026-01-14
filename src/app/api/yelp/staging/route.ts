// Consolidated API endpoint for all Yelp staging operations
import { NextRequest, NextResponse } from 'next/server';
import { batchCreateYelpStaging, bulkUpdateStagingStatus, updateStagingStatus } from '@/lib/database/yelpStaging';
import { supabaseServer } from '@/lib/config/supabaseServer';
import type { YelpBusiness } from '@/lib/yelp/search';
import type { YelpStagingStatus } from '@/lib/types';

/**
 * Helper function to update hex tile staged count from actual database count
 */
async function updateHextileStagedCount(h3Id: string): Promise<void> {
  try {
    const { upsertHextile, getHextile, getHextileCenter } = await import('@/lib/database/hextiles');
    const h3 = await import('h3-js');
    
    // Calculate actual staged count from database
    const { count, error: countError } = await supabaseServer
      .from('yelp_staging')
      .select('*', { count: 'exact', head: true })
      .eq('h3_id', h3Id.trim());
    
    if (countError) {
      console.warn(`⚠️ Failed to count staged restaurants for ${h3Id.trim()}:`, countError);
      return;
    }
    
    const actualStagedCount = count || 0;
    const existing = await getHextile(h3Id.trim());
    
    const center = getHextileCenter(h3Id.trim());
    if (center) {
      const resolution = h3.getResolution(h3Id.trim());
      
      await upsertHextile({
        h3_id: h3Id.trim(),
        city_id: existing?.city_id || '', // Preserve city_id
        status: existing?.status || 'fetched',
        center_lat: center.lat,
        center_lng: center.lng,
        staged: actualStagedCount,  // Use actual count from database
        resolution: resolution
      });
      
      console.log(`✅ Updated hexagon ${h3Id.trim()}: staged count = ${actualStagedCount} (calculated from database)`);
    }
  } catch (hexError) {
    // Non-fatal: log warning but don't throw
    console.warn(`⚠️ Failed to update hexagon staged count ${h3Id} (non-fatal):`, hexError);
  }
}

/**
 * Main POST handler that routes to specific staging operations based on action
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid action: must be a non-empty string. Valid actions: bulk-create, bulk-update-status, check-existing, update-status'
        },
        { status: 400 }
      );
    }

    switch (action) {
      case 'bulk-create':
        return handleBulkCreate(body);
      case 'bulk-update-status':
        return handleBulkUpdateStatus(body);
      case 'check-existing':
        return handleCheckExisting(body);
      case 'update-status':
        return handleUpdateStatus(body);
      default:
        return NextResponse.json(
          {
            success: false,
            message: `Unknown action: "${action}". Valid actions: bulk-create, bulk-update-status, check-existing, update-status`
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('❌ Exception in POST /api/yelp/staging:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error in staging API'
      },
      { status: 500 }
    );
  }
}

/**
 * Handler for bulk creating staging restaurants (for approved restaurants)
 */
async function handleBulkCreate(body: any): Promise<NextResponse> {
  try {
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

    // 🔧 FIX: Create/update hexagon BEFORE saving restaurants
    // This ensures the foreign key constraint is satisfied
    try {
      const { upsertHextile, getHextile, getHextileCenter } = await import('@/lib/database/hextiles');
      const h3 = await import('h3-js');
      
      // Get existing hexagon to check if it already has yelp_total_businesses
      const existing = await getHextile(h3Id.trim());
      
      const center = getHextileCenter(h3Id.trim());
      if (center) {
        const resolution = h3.getResolution(h3Id.trim());
        
        const hextileResult = await upsertHextile({
          h3_id: h3Id.trim(),
          city_id: cityId.trim(),
          status: 'fetched',
          center_lat: center.lat,
          center_lng: center.lng,
          // Only set yelp_total_businesses if hexagon is new (preserve existing if updating)
          yelp_total_businesses: existing?.yelp_total_businesses ?? restaurants.length,
          staged: existing?.staged ?? 0,  // Preserve existing staged count
          resolution: resolution
        });
        
        if (!hextileResult) {
          console.error(`❌ Failed to create/update hexagon ${h3Id.trim()}`);
          return NextResponse.json(
            {
              success: false,
              message: 'Failed to create hexagon tile in database'
            },
            { status: 500 }
          );
        }
        
        console.log(`✅ Created/updated hexagon ${h3Id.trim()} before saving restaurants`);
      } else {
        return NextResponse.json(
          {
            success: false,
            message: `Failed to get center coordinates for hexagon ${h3Id.trim()}`
          },
          { status: 500 }
        );
      }
    } catch (hexError) {
      console.error(`❌ Failed to create hexagon ${h3Id} (fatal):`, hexError);
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to create hexagon tile - cannot save restaurants without it'
        },
        { status: 500 }
      );
    }

    // NOW create staging records (hexagon already exists, so foreign key is satisfied)
    const result = await batchCreateYelpStaging(
      yelpBusinesses,
      h3Id.trim(),
      cityId.trim(),
      importLogId.trim()
    );

    // Update hexagon with staged count after save
    // DO NOT update yelp_total_businesses - it's immutable after first set
    // Calculate actual count from database instead of incrementing for accuracy
    if (result.createdCount > 0) {
      await updateHextileStagedCount(h3Id.trim());
    }

    if (result.createdCount > 0) {
      // Update import log with staging statistics (increment instead of overwrite)
      try {
        const { 
          incrementStagedCount, 
          incrementDuplicatesCount, 
          incrementValidationFailuresCount 
        } = await import('@/lib/database/importLogs');
        
        // Increment each count separately
        if (result.createdCount > 0) {
          await incrementStagedCount(importLogId.trim(), result.createdCount);
        }
        if (result.skippedCount > 0) {
          await incrementDuplicatesCount(importLogId.trim(), result.skippedCount);
        }
        if (result.errorCount > 0) {
          await incrementValidationFailuresCount(importLogId.trim(), result.errorCount);
        }
        
        console.log(`✅ Updated import log ${importLogId} with staging stats: +${result.createdCount} staged, +${result.skippedCount} dupes, +${result.errorCount} invalid`);
      } catch (logError) {
        console.warn('⚠️ Failed to update import log with staging stats (non-fatal):', logError);
      }

      return NextResponse.json({
        success: true,
        message: `Successfully created ${result.createdCount} restaurant${result.createdCount === 1 ? '' : 's'} in staging${result.skippedCount > 0 ? `, ${result.skippedCount} duplicate${result.skippedCount === 1 ? '' : 's'} skipped` : ''}`,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        newBusinesses: result.newBusinesses,
        duplicates: result.duplicates
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: `Failed to create any restaurants. ${result.skippedCount} duplicates, ${result.errorCount} validation errors`,
          createdCount: result.createdCount,
          skippedCount: result.skippedCount,
          errorCount: result.errorCount,
          duplicates: result.duplicates
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('❌ Exception in handleBulkCreate:', {
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

/**
 * Handler for bulk updating staging restaurant statuses
 */
async function handleBulkUpdateStatus(body: any): Promise<NextResponse> {
  try {
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
    const invalidIds = yelpIds.filter((id: any) => typeof id !== 'string' || id.trim().length === 0);
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
      // Update import log approval count if this is an approval action
      if (status === 'approved') {
        try {
          // Get the import log ID and h3_id from one of the updated records
          const { data: stagingRecord } = await supabaseServer
            .from('yelp_staging')
            .select('yelp_import_log, h3_id')
            .eq('id', yelpIds[0])
            .single();

          if (stagingRecord?.yelp_import_log) {
            const { incrementApprovedCount } = await import('@/lib/database/importLogs');
            await incrementApprovedCount(stagingRecord.yelp_import_log, result.successCount);
            console.log(`✅ Updated import log ${stagingRecord.yelp_import_log}: +${result.successCount} approved`);
          }

          // Update hex tile staged count - recalculate from database to ensure accuracy
          if (stagingRecord?.h3_id) {
            await updateHextileStagedCount(stagingRecord.h3_id);
          }
        } catch (logError) {
          console.warn('⚠️ Failed to update import log approval count (non-fatal):', logError);
        }
      }

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
    console.error('❌ Exception in handleBulkUpdateStatus:', {
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

/**
 * Handler to check which restaurants already exist in the database
 */
async function handleCheckExisting(body: any): Promise<NextResponse> {
  try {
    const { yelpIds } = body;

    // Input validation
    if (!yelpIds || !Array.isArray(yelpIds) || yelpIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid yelpIds: must be a non-empty array',
          existingIds: []
        },
        { status: 400 }
      );
    }

    // Validate all IDs are strings
    const validIds = yelpIds.filter((id: any) => typeof id === 'string' && id.trim().length > 0);
    
    if (validIds.length === 0) {
      return NextResponse.json({
        success: true,
        existingIds: [],
        message: 'No valid IDs to check'
      });
    }

    // Query database for existing restaurants
    // Split into batches to avoid URL length limits
    const batchSize = 100;
    const existingIds: string[] = [];

    for (let i = 0; i < validIds.length; i += batchSize) {
      const batch = validIds.slice(i, i + batchSize);
      
      const { data, error } = await supabaseServer
        .from('yelp_staging')
        .select('id')
        .in('id', batch);

      if (error) {
        console.error('Error checking existing restaurants:', error);
        // Continue with other batches even if one fails
        continue;
      }

      if (data && data.length > 0) {
        existingIds.push(...data.map(row => row.id));
      }
    }

    return NextResponse.json({
      success: true,
      existingIds,
      total: validIds.length,
      existingCount: existingIds.length
    });

  } catch (error) {
    console.error('❌ Exception in handleCheckExisting:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error while checking existing restaurants',
        existingIds: []
      },
      { status: 500 }
    );
  }
}

/**
 * Handler for updating a single staging restaurant status
 */
async function handleUpdateStatus(body: any): Promise<NextResponse> {
  try {
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
    console.error('❌ Exception in handleUpdateStatus:', {
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

