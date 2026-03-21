// Database helper functions for Yelp business staging (yelp_staging table)
import { supabaseServer } from '@/shared/config/supabaseServer';
import type { YelpStaging, YelpStagingStatus } from '@/shared/types';
import type { YelpBusiness } from '@/features/yelp/domain/search';
import { validateYelpBusiness, logValidationError, type ValidationContext } from '@/features/yelp/domain/validation';

/**
 * Check multiple businesses for duplicates in a single batch query
 * Returns map of yelpId -> existing record
 * 
 * @param yelpIds - Array of Yelp business IDs to check
 * @returns Map of yelpId to existing staging record
 */
export async function batchCheckDuplicates(
  yelpIds: string[]
): Promise<Map<string, YelpStaging>> {
  try {
    if (!yelpIds || yelpIds.length === 0) {
      return new Map();
    }

    const { data, error } = await supabaseServer
      .from('yelp_staging')
      .select('*')
      .in('id', yelpIds);

    if (error) {
      console.error('Error batch checking duplicates:', error);
      return new Map();
    }

    // Create map of yelpId -> existing record
    const duplicateMap = new Map<string, YelpStaging>();
    data?.forEach(record => {
      duplicateMap.set(record.id, record);
    });

    return duplicateMap;
  } catch (error) {
    console.error('Exception batch checking duplicates:', error);
    return new Map();
  }
}

/**
 * Check multiple businesses for duplicates by name and address
 * Returns map of business ID -> existing record for duplicates found
 * This is more robust than ID-only checking, especially for manual imports
 * 
 * @param businesses - Array of businesses to check
 * @returns Map of business ID to existing staging record (for duplicates only)
 */
export async function batchCheckDuplicatesByNameAddress(
  businesses: YelpBusiness[]
): Promise<Map<string, YelpStaging>> {
  try {
    if (!businesses || businesses.length === 0) {
      return new Map();
    }

    // Query all staging records (we'll filter in memory)
    // Note: For large datasets, this should be optimized with DB-level filtering
    const { data, error } = await supabaseServer
      .from('yelp_staging')
      .select('*');

    if (error) {
      console.error('Error batch checking duplicates by name+address:', error);
      return new Map();
    }

    // Create lookup map: "name|address" -> existing record
    const existingByKey = new Map<string, YelpStaging>();
    
    data?.forEach(record => {
      if (record.data && typeof record.data === 'object') {
        const business = record.data as YelpBusiness;
        const key = `${business.name?.toLowerCase().trim() || ''}|${business.location?.address1?.toLowerCase().trim() || ''}`;
        existingByKey.set(key, record);
      }
    });

    // Check incoming businesses and build result map using business ID as key
    const resultMap = new Map<string, YelpStaging>();
    
    businesses.forEach(business => {
      const key = `${business.name?.toLowerCase().trim() || ''}|${business.location?.address1?.toLowerCase().trim() || ''}`;
      const existing = existingByKey.get(key);
      if (existing) {
        resultMap.set(business.id, existing);
      }
    });

    console.log(`📊 Duplicate check: ${resultMap.size} duplicates found out of ${businesses.length} checked`);
    return resultMap;
  } catch (error) {
    console.error('Exception batch checking duplicates by name+address:', error);
    return new Map();
  }
}

/**
 * Get all staging businesses for a hexagon
 * Returns array of staging records, or empty array on error
 */
export async function getStagingBusinessesByHexagon(h3Id: string): Promise<YelpStaging[]> {
  try {
    const { data, error } = await supabaseServer
      .from('yelp_staging')
      .select('*')
      .eq('h3_id', h3Id);

    if (error) {
      console.error('Error fetching staging businesses by hexagon from database:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching staging businesses by hexagon from database:', error);
    return [];
  }
}

/**
 * Get staging businesses and convert to YelpBusiness format
 * Useful for reconstructing HexagonYelpResult from cache
 */
export async function getStagingBusinessesAsYelpBusinesses(
  h3Id: string,
  options?: { includeRejected?: boolean }
): Promise<YelpBusiness[]> {
  try {
    const stagingRecords = await getStagingBusinessesByHexagon(h3Id);
    
    const includeRejected = options?.includeRejected === true;
    // Filter to only 'new' or 'approved' status (exclude 'rejected' and 'duplicate' by default)
    const validRecords = stagingRecords.filter(record => {
      if (record.status === 'new' || record.status === 'approved') return true;
      if (includeRejected && record.status === 'rejected') return true;
      return false;
    });
    
    // Convert staging data to YelpBusiness format
    const businesses: YelpBusiness[] = [];
    for (const record of validRecords) {
      if (record.data && typeof record.data === 'object') {
        // Type assertion - we know this is YelpBusiness from our insert
        const business = record.data as YelpBusiness;
        businesses.push(business);
      }
    }
    
    return businesses;
  } catch (error) {
    console.error('Exception converting staging businesses to YelpBusiness format:', error);
    return [];
  }
}

/**
 * Information about duplicate restaurants found during batch create
 */
export interface DuplicateInfo {
  yelpId: string;              // The Yelp business ID (same as DB id)
  cityId: string;              // City ID of existing record
  h3Id?: string;               // Hexagon ID of existing record
}

export interface StagingInsertError {
  h3Id: string;
  batchIndex: number;
  sampleIds: string[];
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
  kind: 'insert_error' | 'unique_conflict';
}

/**
 * Batch create staging businesses
 * More efficient than individual creates for large batches
 * Validates all businesses before saving - invalid ones are skipped and logged
 * Returns detailed statistics about the operation
 */
export interface BatchCreateStats {
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  validationErrorCount: number;
  insertErrorCount: number;
  newBusinesses: YelpBusiness[]; // Actual businesses that were newly inserted
  duplicates: DuplicateInfo[];   // Details about each duplicate found
  insertErrors: StagingInsertError[];
}

export async function batchCreateYelpStaging(
  businesses: YelpBusiness[],
  h3Id: string,
  cityId: string,
  importLogId: string
): Promise<BatchCreateStats> {
  try {
    console.log(`📦 batchCreateYelpStaging called: ${businesses.length} businesses, h3Id: ${h3Id}, cityId: ${cityId}, importLogId: ${importLogId}`);
    
    const context: ValidationContext = {
      h3Id,
      cityId,
      importLogId
    };

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let validationErrorCount = 0;
    let insertErrorCount = 0;
    const newBusinesses: YelpBusiness[] = []; // Track businesses that were actually inserted
    const allDuplicates: DuplicateInfo[] = []; // Track duplicates across all batches
    const insertErrors: StagingInsertError[] = [];
    
    // Process in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < businesses.length; i += batchSize) {
      const batch = businesses.slice(i, i + batchSize);
      console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} businesses`);
      
      // Step 1: Validate all businesses in batch
      const validBusinesses: YelpBusiness[] = [];
      for (const business of batch) {
        const validation = validateYelpBusiness(business, context);
        
        if (!validation.valid) {
          // Log validation error with clear formatting
          logValidationError(business, context, validation.errors);
          errorCount++;
          validationErrorCount++;
          continue; // Skip invalid business
        }
        
        validBusinesses.push(business);
      }
      
      console.log(`    Validation: ${validBusinesses.length} valid, ${batch.length - validBusinesses.length} invalid`);
      
      // Step 2: Check duplicates by Yelp ID first, then by name+address
      const duplicateMapById = await batchCheckDuplicates(validBusinesses.map(business => business.id));
      const duplicateMapByNameAddress = await batchCheckDuplicatesByNameAddress(validBusinesses);
      const duplicateMap = new Map<string, YelpStaging>(duplicateMapById);
      duplicateMapByNameAddress.forEach((record, key) => {
        if (!duplicateMap.has(key)) {
          duplicateMap.set(key, record);
        }
      });

      // Build duplicate info array
      const duplicatesInBatch: DuplicateInfo[] = [];
      for (const business of validBusinesses) {
        const existing = duplicateMap.get(business.id);
        if (existing) {
          duplicatesInBatch.push({
            yelpId: business.id,
            cityId: existing.city_id,
            h3Id: existing.h3_id
          });
          skippedCount++;
        }
      }

      // Add to overall duplicates list
      allDuplicates.push(...duplicatesInBatch);

      const existingIds = new Set(duplicateMap.keys());
      console.log(`    Duplicates: ${existingIds.size} found, ${validBusinesses.length - existingIds.size} new`);
      
      // Step 3: Filter out duplicates
      const newBusinessesInBatch = validBusinesses.filter(b => !existingIds.has(b.id));
      
      if (newBusinessesInBatch.length > 0) {
        // Insert new businesses
        const stagingRecords = newBusinessesInBatch.map(business => ({
          id: business.id,
          data: business,
          h3_id: h3Id,
          city_id: cityId,
          yelp_import_log: importLogId,
          status: 'new' as YelpStagingStatus
        }));
        
        console.log(`    Attempting to insert ${newBusinessesInBatch.length} new businesses to database...`);
        const { error } = await supabaseServer
          .from('yelp_staging')
          .insert(stagingRecords);
        
        if (error) {
          console.error('❌ Error batch creating yelp staging:', {
            batchIndex: i,
            batchSize: newBusinessesInBatch.length,
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            h3Id,
            cityId,
            importLogId
          });
          // Handle unique conflicts as duplicate races instead of opaque hard-fail
          if (error.code === '23505') {
            const idsToRecover = newBusinessesInBatch.map(business => business.id);
            const existingBeforeRecovery = await batchCheckDuplicates(idsToRecover);
            const { error: recoveryError } = await supabaseServer
              .from('yelp_staging')
              .upsert(stagingRecords, { onConflict: 'id', ignoreDuplicates: true });

            if (recoveryError) {
              insertErrorCount++;
              errorCount++;
              insertErrors.push({
                h3Id,
                batchIndex: i,
                sampleIds: idsToRecover.slice(0, 5),
                code: recoveryError.code,
                message: recoveryError.message,
                details: recoveryError.details,
                hint: recoveryError.hint,
                kind: 'insert_error'
              });
            } else {
              const existingAfterRecovery = await batchCheckDuplicates(idsToRecover);
              const recoveredPresentCount = existingAfterRecovery.size;
              const recoveredCreatedCount = Math.max(0, recoveredPresentCount - existingBeforeRecovery.size);
              const recoveredConflictCount = existingBeforeRecovery.size;
              const recoveredMissingCount = Math.max(0, idsToRecover.length - recoveredPresentCount);

              if (recoveredCreatedCount > 0) {
                createdCount += recoveredCreatedCount;
                const beforeSet = new Set(existingBeforeRecovery.keys());
                const recoveredNewBusinesses = newBusinessesInBatch.filter(business => !beforeSet.has(business.id));
                newBusinesses.push(...recoveredNewBusinesses.slice(0, recoveredCreatedCount));
              }

              if (recoveredConflictCount > 0) {
                skippedCount += recoveredConflictCount;
                existingBeforeRecovery.forEach((existing, yelpId) => {
                  allDuplicates.push({
                    yelpId,
                    cityId: existing.city_id,
                    h3Id: existing.h3_id
                  });
                });
                insertErrors.push({
                  h3Id,
                  batchIndex: i,
                  sampleIds: Array.from(existingBeforeRecovery.keys()).slice(0, 5),
                  code: error.code,
                  message: error.message,
                  details: error.details,
                  hint: error.hint,
                  kind: 'unique_conflict'
                });
              }

              if (recoveredMissingCount > 0) {
                insertErrorCount++;
                errorCount++;
                const persistedIds = new Set(existingAfterRecovery.keys());
                const missingIds = idsToRecover.filter(id => !persistedIds.has(id));
                insertErrors.push({
                  h3Id,
                  batchIndex: i,
                  sampleIds: missingIds.slice(0, 5),
                  code: error.code,
                  message: 'Unique-conflict recovery was incomplete; some rows are still missing',
                  details: error.details,
                  hint: error.hint,
                  kind: 'insert_error'
                });
              }
            }
          } else {
            insertErrorCount++;
            errorCount++;
            insertErrors.push({
              h3Id,
              batchIndex: i,
              sampleIds: newBusinessesInBatch.map(business => business.id).slice(0, 5),
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint,
              kind: 'insert_error'
            });
          }
          // Continue with next batch even if this one fails
        } else {
          createdCount += newBusinessesInBatch.length;
          newBusinesses.push(...newBusinessesInBatch); // Add newly inserted businesses to the result
          console.log(`    ✅ Successfully inserted ${newBusinessesInBatch.length} businesses to database (total saved: ${createdCount})`);
        }
      } else {
        console.log(`    No new businesses to insert (all duplicates or invalid)`);
      }
    }
    
    // Log summary
    console.log(
      `📊 batchCreateYelpStaging summary: ${createdCount} saved, ${skippedCount} duplicates skipped, ` +
      `${validationErrorCount} validation errors, ${insertErrorCount} insert errors`
    );
    
    return {
      createdCount,
      skippedCount,
      errorCount,
      validationErrorCount,
      insertErrorCount,
      newBusinesses,
      duplicates: allDuplicates,
      insertErrors
    };
  } catch (error) {
    console.error('❌ Exception in batchCreateYelpStaging:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      h3Id,
      cityId,
      importLogId,
      businessCount: businesses.length
    });
    return {
      createdCount: 0,
      skippedCount: 0,
      errorCount: businesses.length, // Assume all failed on exception
      validationErrorCount: 0,
      insertErrorCount: businesses.length,
      newBusinesses: [],
      duplicates: [],
      insertErrors: [{
        h3Id,
        batchIndex: -1,
        sampleIds: businesses.map((business) => business.id).filter(Boolean).slice(0, 5),
        code: null,
        message: error instanceof Error ? error.message : String(error),
        details: null,
        hint: null,
        kind: 'insert_error'
      }]
    };
  }
}

/**
 * Update the status of a single staging business
 * 
 * @param yelpId - The Yelp business ID to update
 * @param status - The new status to set ('new' | 'duplicate' | 'approved' | 'rejected')
 * @returns true if update was successful, false otherwise
 */
export async function updateStagingStatus(
  yelpId: string,
  status: YelpStagingStatus
): Promise<boolean> {
  try {
    // Input validation
    if (!yelpId || typeof yelpId !== 'string' || yelpId.trim().length === 0) {
      console.error('❌ updateStagingStatus: Invalid yelpId provided');
      return false;
    }

    const validStatuses: YelpStagingStatus[] = ['new', 'duplicate', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      console.error(`❌ updateStagingStatus: Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}`);
      return false;
    }

    // Update the status
    const { error, data } = await supabaseServer
      .from('yelp_staging')
      .update({ status })
      .eq('id', yelpId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('❌ Error updating staging status:', {
        yelpId,
        status,
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return false;
    }

    // Check if record was found and updated
    if (!data) {
      console.warn(`⚠️ updateStagingStatus: Restaurant with ID "${yelpId}" not found in database`);
      return false;
    }

    console.log(`✅ Successfully updated staging status: ${yelpId} → ${status}`);
    return true;
  } catch (error) {
    console.error('❌ Exception updating staging status:', {
      yelpId,
      status,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

/**
 * Bulk update the status of multiple staging businesses
 * More efficient than individual updates for large batches
 * 
 * @param yelpIds - Array of Yelp business IDs to update
 * @param status - The new status to set ('new' | 'duplicate' | 'approved' | 'rejected')
 * @returns Object with success count, failed count, and failed IDs
 */
export async function bulkUpdateStagingStatus(
  yelpIds: string[],
  status: YelpStagingStatus
): Promise<{ successCount: number; failedCount: number; failedIds: string[] }> {
  try {
    // Input validation
    if (!yelpIds || !Array.isArray(yelpIds) || yelpIds.length === 0) {
      console.error('❌ bulkUpdateStagingStatus: Invalid yelpIds provided - must be non-empty array');
      return { successCount: 0, failedCount: 0, failedIds: [] };
    }

    const validStatuses: YelpStagingStatus[] = ['new', 'duplicate', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      console.error(`❌ bulkUpdateStagingStatus: Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}`);
      return { successCount: 0, failedCount: yelpIds.length, failedIds: yelpIds };
    }

    // Filter out invalid IDs
    const validIds = yelpIds.filter(id => id && typeof id === 'string' && id.trim().length > 0);
    if (validIds.length === 0) {
      console.error('❌ bulkUpdateStagingStatus: No valid IDs provided after filtering');
      return { successCount: 0, failedCount: yelpIds.length, failedIds: yelpIds };
    }

    // Remove duplicates
    const uniqueIds = Array.from(new Set(validIds.map(id => id.trim())));

    console.log(`📦 bulkUpdateStagingStatus: Updating ${uniqueIds.length} businesses to status "${status}"`);

    // Process in batches to avoid overwhelming the database
    const batchSize = 100;
    let totalSuccessCount = 0;
    const failedIds: string[] = [];

    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const batch = uniqueIds.slice(i, i + batchSize);
      console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} businesses`);

      // Update batch using Supabase .in() filter
      const { data, error } = await supabaseServer
        .from('yelp_staging')
        .update({ status })
        .in('id', batch)
        .select('id');

      if (error) {
        console.error('❌ Error bulk updating staging status:', {
          batchIndex: i,
          batchSize: batch.length,
          status,
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        // Mark entire batch as failed
        failedIds.push(...batch);
      } else {
        // Count successful updates
        const updatedIds = data?.map(record => record.id) || [];
        const successInBatch = updatedIds.length;
        totalSuccessCount += successInBatch;

        // Find failed IDs (IDs that were requested but not updated)
        const updatedSet = new Set(updatedIds);
        const failedInBatch = batch.filter(id => !updatedSet.has(id));
        failedIds.push(...failedInBatch);

        console.log(`    ✅ Successfully updated ${successInBatch} businesses (${failedInBatch.length} not found)`);
      }
    }

    const totalFailed = failedIds.length;
    console.log(`📊 bulkUpdateStagingStatus summary: ${totalSuccessCount} updated, ${totalFailed} failed`);

    return {
      successCount: totalSuccessCount,
      failedCount: totalFailed,
      failedIds
    };
  } catch (error) {
    console.error('❌ Exception in bulkUpdateStagingStatus:', {
      status,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      yelpIdsCount: yelpIds.length
    });
    return {
      successCount: 0,
      failedCount: yelpIds.length,
      failedIds: yelpIds
    };
  }
}

