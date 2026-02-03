// Consolidated API endpoint for all Yelp staging operations
import { NextRequest, NextResponse } from 'next/server';
import { batchCreateYelpStaging, bulkUpdateStagingStatus, updateStagingStatus } from '@/features/yelp/data/yelpStaging';
import { supabaseServer } from '@/shared/config/supabaseServer';
import type { YelpBusiness } from '@/features/yelp/domain/search';
import type { YelpStagingStatus, YelpHextileStatus } from '@/shared/types';

// ============================================================================
// SHARED VALIDATION HELPERS (DRY)
// ============================================================================

/**
 * Validate restaurants array - shared between bulk-create and manual-import
 */
function validateRestaurantsArray(restaurants: unknown): { valid: false; response: NextResponse } | { valid: true } {
  if (!restaurants || !Array.isArray(restaurants) || restaurants.length === 0) {
    return {
      valid: false,
      response: NextResponse.json(
        { success: false, message: 'Invalid restaurants: must be a non-empty array' },
        { status: 400 }
      )
    };
  }
  return { valid: true };
}

/**
 * Validate cityId - shared between bulk-create and manual-import
 */
function validateCityId(cityId: unknown): { valid: false; response: NextResponse } | { valid: true } {
  if (!cityId || typeof cityId !== 'string' || cityId.trim().length === 0) {
    return {
      valid: false,
      response: NextResponse.json(
        { success: false, message: 'Invalid cityId: must be a non-empty string' },
        { status: 400 }
      )
    };
  }
  return { valid: true };
}

/**
 * Validate restaurant IDs in array - shared between bulk-create and manual-import
 */
function validateRestaurantIds(restaurants: any[]): { valid: false; response: NextResponse } | { valid: true } {
  const invalidRestaurants = restaurants.filter(
    (r: any) => !r || !r.id || typeof r.id !== 'string' || r.id.trim().length === 0
  );
  if (invalidRestaurants.length > 0) {
    return {
      valid: false,
      response: NextResponse.json(
        { success: false, message: `Invalid restaurants found: ${invalidRestaurants.length} restaurants are missing required fields (id)` },
        { status: 400 }
      )
    };
  }
  return { valid: true };
}

/**
 * Validate restaurant coordinates - used for manual-import
 */
function validateRestaurantCoordinates(restaurants: any[]): { valid: false; response: NextResponse } | { valid: true } {
  const invalidCoords = restaurants.filter((r: any) => 
    !r.coordinates || 
    typeof r.coordinates.latitude !== 'number' || 
    typeof r.coordinates.longitude !== 'number' ||
    isNaN(r.coordinates.latitude) || 
    isNaN(r.coordinates.longitude)
  );
  if (invalidCoords.length > 0) {
    return {
      valid: false,
      response: NextResponse.json(
        { success: false, message: `${invalidCoords.length} restaurants have invalid coordinates (latitude and longitude must be numbers)` },
        { status: 400 }
      )
    };
  }
  return { valid: true };
}

// ============================================================================
// SHARED HEXTILE HELPERS (DRY)
// ============================================================================

/**
 * Update hex tile staged count from actual database count
 */
async function updateHextileStagedCount(h3Id: string): Promise<void> {
  try {
    const { upsertHextile, getHextile, getHextileCenter } = await import('@/features/yelp/data/hextiles');
    const h3 = await import('h3-js');
    
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
        city_id: existing?.city_id || '',
        status: existing?.status || 'fetched',
        center_lat: center.lat,
        center_lng: center.lng,
        staged: actualStagedCount,
        resolution: resolution
      });
      
      console.log(`✅ Updated hexagon ${h3Id.trim()}: staged count = ${actualStagedCount} (calculated from database)`);
    }
  } catch (hexError) {
    console.warn(`⚠️ Failed to update hexagon staged count ${h3Id} (non-fatal):`, hexError);
  }
}

/**
 * Ensure a hextile exists in the database (upsert if needed)
 * Returns true on success, false on failure
 */
async function ensureHextileExists(
  h3Id: string, 
  cityId: string, 
  restaurantCount?: number
): Promise<{ success: true } | { success: false; response: NextResponse }> {
  try {
    const { upsertHextile, getHextile, getHextileCenter } = await import('@/features/yelp/data/hextiles');
    const h3 = await import('h3-js');
    
    const existing = await getHextile(h3Id.trim());
    const center = getHextileCenter(h3Id.trim());
    
    if (!center) {
      return {
        success: false,
        response: NextResponse.json(
          { success: false, message: `Failed to get center coordinates for hexagon ${h3Id.trim()}` },
          { status: 500 }
        )
      };
    }
    
    const resolution = h3.getResolution(h3Id.trim());
    
    const hextileResult = await upsertHextile({
      h3_id: h3Id.trim(),
      city_id: cityId.trim(),
      status: 'fetched' as YelpHextileStatus,
      center_lat: center.lat,
      center_lng: center.lng,
      yelp_total_businesses: existing?.yelp_total_businesses ?? restaurantCount,
      staged: existing?.staged ?? 0,
      resolution: resolution
    });
    
    if (!hextileResult) {
      console.error(`❌ Failed to create/update hexagon ${h3Id.trim()}`);
      return {
        success: false,
        response: NextResponse.json(
          { success: false, message: 'Failed to create hexagon tile in database' },
          { status: 500 }
        )
      };
    }
    
    console.log(`✅ Ensured hexagon ${h3Id.trim()} exists`);
    return { success: true };
  } catch (hexError) {
    console.error(`❌ Failed to ensure hexagon ${h3Id} exists:`, hexError);
    return {
      success: false,
      response: NextResponse.json(
        { success: false, message: 'Failed to create hexagon tile - cannot save restaurants without it' },
        { status: 500 }
      )
    };
  }
}

// ============================================================================
// MAIN POST HANDLER
// ============================================================================

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
          message: 'Invalid action: must be a non-empty string. Valid actions: bulk-create, bulk-update-status, check-existing, get-statuses, get-status-counts, update-status, manual-import'
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
      case 'get-statuses':
        return handleGetStatuses(body);
      case 'get-status-counts':
        return handleGetStatusCounts(body);
      case 'update-status':
        return handleUpdateStatus(body);
      case 'manual-import':
        return handleManualImport(body);
      default:
        return NextResponse.json(
          {
            success: false,
          message: `Unknown action: "${action}". Valid actions: bulk-create, bulk-update-status, check-existing, get-statuses, get-status-counts, update-status, manual-import`
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
      { success: false, message: 'Internal server error in staging API' },
      { status: 500 }
    );
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

/**
 * Handler for bulk creating staging restaurants (for approved restaurants)
 */
async function handleBulkCreate(body: any): Promise<NextResponse> {
  try {
    const { restaurants, h3Id, cityId, importLogId } = body;

    // Use shared validation helpers
    const restaurantsValidation = validateRestaurantsArray(restaurants);
    if (!restaurantsValidation.valid) return restaurantsValidation.response;

    if (!h3Id || typeof h3Id !== 'string' || h3Id.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid h3Id: must be a non-empty string' },
        { status: 400 }
      );
    }

    const cityIdValidation = validateCityId(cityId);
    if (!cityIdValidation.valid) return cityIdValidation.response;

    if (!importLogId || typeof importLogId !== 'string' || importLogId.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid importLogId: must be a non-empty string' },
        { status: 400 }
      );
    }

    const restaurantIdsValidation = validateRestaurantIds(restaurants);
    if (!restaurantIdsValidation.valid) return restaurantIdsValidation.response;

    // Ensure hextile exists (FK constraint) using shared helper
    const hextileResult = await ensureHextileExists(h3Id, cityId, restaurants.length);
    if (!hextileResult.success) return hextileResult.response;

    // Create staging records using shared database function
    const result = await batchCreateYelpStaging(
      restaurants as YelpBusiness[],
      h3Id.trim(),
      cityId.trim(),
      importLogId.trim()
    );

    // Update hexagon staged count from actual database
    if (result.createdCount > 0) {
      await updateHextileStagedCount(h3Id.trim());
    }

    // Update import log with staging statistics
    try {
      const { incrementStagedCount, incrementDuplicatesCount } = await import('@/features/yelp/data/importLogs');
      
      if (result.createdCount > 0) {
        await incrementStagedCount(importLogId.trim(), result.createdCount);
      }
      if (result.skippedCount > 0) {
        await incrementDuplicatesCount(importLogId.trim(), result.skippedCount);
      }
      
      console.log(`✅ Updated import log ${importLogId} with staging stats: +${result.createdCount} staged, +${result.skippedCount} dupes`);
    } catch (logError) {
      console.warn('⚠️ Failed to update import log with staging stats (non-fatal):', logError);
    }

    if (result.createdCount > 0) {
      return NextResponse.json({
        success: true,
        message: `Successfully created ${result.createdCount} restaurant${result.createdCount === 1 ? '' : 's'} in staging${result.skippedCount > 0 ? `, ${result.skippedCount} duplicate${result.skippedCount === 1 ? '' : 's'} skipped` : ''}`,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        newBusinesses: result.newBusinesses,
        duplicates: result.duplicates
      });
    }

    if (result.skippedCount > 0 && result.errorCount === 0) {
      return NextResponse.json({
        success: true,
        message: `No new restaurants created. ${result.skippedCount} duplicate${result.skippedCount === 1 ? '' : 's'} skipped`,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        newBusinesses: result.newBusinesses,
        duplicates: result.duplicates
      });
    }

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
  } catch (error) {
    console.error('❌ Exception in handleBulkCreate:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      { success: false, message: 'Internal server error while creating staging restaurants' },
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
      // Update hex tile staged count - recalculate from database to ensure accuracy
      if (status === 'approved') {
        try {
          // Get the h3_id from one of the updated records
          const { data: stagingRecord } = await supabaseServer
            .from('yelp_staging')
            .select('h3_id')
            .eq('id', yelpIds[0])
            .single();

          if (stagingRecord?.h3_id) {
            await updateHextileStagedCount(stagingRecord.h3_id);
          }
        } catch (logError) {
          console.warn('⚠️ Failed to update hex tile staged count (non-fatal):', logError);
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
 * Handler to get current statuses for a set of restaurants
 */
async function handleGetStatuses(body: any): Promise<NextResponse> {
  try {
    const { yelpIds } = body;

    if (!yelpIds || !Array.isArray(yelpIds) || yelpIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid yelpIds: must be a non-empty array',
          statuses: []
        },
        { status: 400 }
      );
    }

    const validIds = Array.from(
      new Set(
        yelpIds.filter((id: any) => typeof id === 'string' && id.trim().length > 0).map((id: string) => id.trim())
      )
    );

    if (validIds.length === 0) {
      return NextResponse.json({
        success: true,
        statuses: [],
        message: 'No valid IDs to check'
      });
    }

    const batchSize = 200;
    const statuses: Array<{ id: string; status: YelpStagingStatus }> = [];

    for (let i = 0; i < validIds.length; i += batchSize) {
      const batch = validIds.slice(i, i + batchSize);
      const { data, error } = await supabaseServer
        .from('yelp_staging')
        .select('id, status')
        .in('id', batch);

      if (error) {
        console.error('Error fetching restaurant statuses:', error);
        continue;
      }

      if (data && data.length > 0) {
        statuses.push(...(data as Array<{ id: string; status: YelpStagingStatus }>));
      }
    }

    return NextResponse.json({
      success: true,
      statuses,
      total: validIds.length,
      found: statuses.length
    });
  } catch (error) {
    console.error('❌ Exception in handleGetStatuses:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error while fetching restaurant statuses',
        statuses: []
      },
      { status: 500 }
    );
  }
}

/**
 * Handler to get status counts for a city or import log
 */
async function handleGetStatusCounts(body: any): Promise<NextResponse> {
  try {
    const { cityId, importLogId } = body;

    if ((!cityId || typeof cityId !== 'string' || cityId.trim().length === 0) &&
        (!importLogId || typeof importLogId !== 'string' || importLogId.trim().length === 0)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid cityId or importLogId: at least one non-empty string is required'
        },
        { status: 400 }
      );
    }

    let query = supabaseServer
      .from('yelp_staging')
      .select('status');

    if (cityId && typeof cityId === 'string' && cityId.trim().length > 0) {
      query = query.eq('city_id', cityId.trim());
    } else if (importLogId && typeof importLogId === 'string' && importLogId.trim().length > 0) {
      query = query.eq('yelp_import_log', importLogId.trim());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching status counts:', error);
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to fetch status counts'
        },
        { status: 500 }
      );
    }

    const counts: Record<YelpStagingStatus, number> = {
      new: 0,
      duplicate: 0,
      approved: 0,
      rejected: 0
    };

    (data || []).forEach((row: { status?: YelpStagingStatus }) => {
      const status = row.status;
      if (status && counts[status] !== undefined) {
        counts[status] += 1;
      }
    });

    const total = counts.new + counts.approved + counts.rejected;

    return NextResponse.json({
      success: true,
      counts: {
        ...counts,
        total
      }
    });
  } catch (error) {
    console.error('❌ Exception in handleGetStatusCounts:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error while fetching status counts'
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

/**
 * Handler for manual restaurant import from CSV
 * DOES NOT save to DB - only validates, calculates H3 IDs, and returns data
 * Restaurants stay in frontend state until first approve/reject
 */
async function handleManualImport(body: any): Promise<NextResponse> {
  try {
    const { restaurants, cityId } = body;
    
    console.log('[manual-import] Processing manual import', {
      restaurantCount: restaurants?.length,
      cityId
    });
    
    // Validation
    const restaurantsValidation = validateRestaurantsArray(restaurants);
    if (!restaurantsValidation.valid) return restaurantsValidation.response;

    const cityIdValidation = validateCityId(cityId);
    if (!cityIdValidation.valid) return cityIdValidation.response;

    const coordsValidation = validateRestaurantCoordinates(restaurants);
    if (!coordsValidation.valid) return coordsValidation.response;
    
    // Calculate H3 IDs and assign to each restaurant
    const h3 = await import('h3-js');
    const restaurantsWithH3: any[] = [];
    
    for (const restaurant of restaurants) {
      const h3Id = h3.latLngToCell(
        restaurant.coordinates.latitude,
        restaurant.coordinates.longitude,
        7 // Resolution 7, same as Yelp importer
      );
      
      restaurantsWithH3.push({
        ...restaurant,
        h3Id // Add H3 ID to restaurant object
      });
    }
    
    console.log(`✅ Calculated H3 IDs for ${restaurantsWithH3.length} restaurants`);
    
    // Return restaurants with H3 IDs - NO DB SAVE
    return NextResponse.json({
      success: true,
      restaurants: restaurantsWithH3,
      message: `Processed ${restaurantsWithH3.length} restaurant${restaurantsWithH3.length === 1 ? '' : 's'} from CSV`,
      h3IdsCalculated: true
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Exception in handleManualImport:', { error: errorMessage });
    
    return NextResponse.json(
      { success: false, message: 'Internal server error while processing restaurants' },
      { status: 500 }
    );
  }
}

