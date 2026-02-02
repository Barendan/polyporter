import { NextResponse } from 'next/server';
import { YelpSearchEngine, type HexagonYelpResult } from '@/features/yelp/domain/search';
import { hexagonProcessor } from '@/shared/hexagons/processor';
import { yelpQuotaManager } from '@/shared/utils/quotaManager';
import { getCityByName } from '@/shared/database/cities';
import { supabaseServer } from '@/shared/config/supabaseServer';
import { getValidHextile, upsertHextile, getHextileCenter } from '@/features/yelp/data/hextiles';
import { createImportLog, updateImportLog } from '@/features/yelp/data/importLogs';
import { parseCityInput } from '@/shared/utils/cityNormalizer';
import { getStagingBusinessesAsYelpBusinesses } from '@/features/yelp/data/yelpStaging';
import { processingStates, type ProcessingState } from './state';
import * as h3 from 'h3-js';

// Initialize Yelp search engine
const yelpEngine = new YelpSearchEngine(process.env.YELP_API_KEY || 'demo-key');

/**
 * Process hexagons with Yelp search
 * Handles two-phase processing: Phase 1 (resolution 7) and Phase 2 (subdivision resolution 8)
 */
export async function processHexagons(
  hexagons: string[] | Array<{ h3Id: string; mapIndex: number; originalIndex: number }>, 
  testMode: boolean = false,
  cityName?: string,
  city_id?: string
): Promise<NextResponse> {
  try {
    console.log('[processHexagons] start', { city_id, cityName });
    if (!hexagons || hexagons.length === 0) {
      return NextResponse.json(
        { error: 'No hexagons provided' },
        { status: 400 }
      );
    }

    // PRIMARY: Use city_id if provided (this prevents the duplicate issue)
    let cityId: string | null = null;
    
    if (city_id) {
      // Validate city_id exists
      const { data: city, error: cityError } = await supabaseServer
        .from('cities')
        .select('id')
        .eq('id', city_id)
        .single();
      
      if (city && !cityError) {
        cityId = city_id;
        console.log('[processHexagons] city_id validation', {
          city_id,
          cityIdResolved: cityId
        });
      } else {
        console.warn('[processHexagons] invalid city_id, falling back', { city_id, cityError });
      }
    }
    
    // FALLBACK: Read-only lookup (DO NOT CREATE) - only for backward compatibility
    // This prevents the "Doral Miami-dade County" duplicate bug
    if (!cityId && cityName) {
      try {
        // Guard: Only accept "City, ST" format (prevents display_name parsing)
        const trimmed = cityName.trim();
        const isValidFormat = /,\s*[A-Z]{2}$/.test(trimmed);

        console.log('[processHexagons] fallback check', {
          cityName: trimmed,
          isValidFormat
        });
        
        if (!isValidFormat) {
          console.warn(`⚠️ Rejecting invalid cityName format: "${trimmed}". Expected format: "City, ST"`);
        } else {
          const parsed = parseCityInput(trimmed);
          if (parsed) {
            // READ-ONLY: Only lookup, never create
            const city = await getCityByName(parsed.cityName, parsed.state);
            if (city) {
              cityId = city.id;
              console.log(`✅ Found city via read-only name lookup: ${parsed.cityName}, ${parsed.state} (ID: ${cityId})`);
            } else {
              // City doesn't exist - FAIL instead of creating (prevents duplicate bug)
              console.error(`❌ City not found via name lookup: ${parsed.cityName}, ${parsed.state}. city_id is required for new cities. Import logs and staging will be skipped.`);
              // Don't create - this prevents the duplicate bug
            }
          } else {
            console.warn(`⚠️ Could not parse city name: "${trimmed}" - import logs and staging will be skipped`);
          }
        }
      } catch (dbError) {
        // Graceful degradation: continue without city_id if lookup fails
        console.error('❌ Error looking up city (non-fatal):', {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          cityName
        });
      }
    } else if (!cityId) {
      console.warn('⚠️ No city_id provided - import logs and staging will be skipped');
    }

    // Check quota before processing
    const quotaEstimate = yelpQuotaManager.estimateQuotaForCity(hexagons.length, 7, 1.5);
    
    if (!quotaEstimate.canProcessRequest && !testMode) {
      return NextResponse.json({
        error: 'Insufficient quota',
        quotaEstimate,
        recommendations: quotaEstimate.recommendations
      }, { status: 429 });
    }
    
    // Additional quota check for test mode
    if (testMode) {
      const maxTestHexagons = 5;
      const estimatedCalls = Math.min(hexagons.length, maxTestHexagons) * 3; // Assume 3 search points per hexagon
      const quotaStatus = yelpQuotaManager.getQuotaStatus();
      
      if (quotaStatus.dailyRemaining < estimatedCalls) {
        return NextResponse.json({
          error: 'Insufficient quota for test',
          quotaStatus,
          estimatedCalls,
          recommendations: ['Wait for quota reset', 'Reduce test size', 'Check daily usage']
        }, { status: 429 });
      }
    }

    // SAFETY CHECK: Strict limit for test mode to prevent quota abuse
    let hexagonsToProcess: string[] = [];
    let hexagonIndices: number[] = [];
    
    // Handle both string[] and object[] formats, preserving indices
    if (Array.isArray(hexagons) && hexagons.length > 0) {
      if (typeof hexagons[0] === 'string') {
        // Legacy format: string[]
        hexagonIndices = hexagons.map((_, index) => index);
        hexagonsToProcess = hexagons as string[];
      } else {
        // New format: Array<{ h3Id: string; mapIndex: number; originalIndex: number }>
        const hexagonData = hexagons as Array<{ h3Id: string; mapIndex: number; originalIndex: number }>;
        hexagonsToProcess = hexagonData.map(h => h.h3Id);
        hexagonIndices = hexagonData.map(h => h.originalIndex);
      }
    }
    
    // FIX: Capture original count BEFORE slicing for test mode
    const originalTotalHexagons = hexagonsToProcess.length;
    
    if (testMode) {
      // Test mode: use real Yelp API calls on limited hexagons
      const maxTestHexagons = 5; // Strict limit for testing
      hexagonsToProcess = hexagonsToProcess.slice(0, maxTestHexagons);
      hexagonIndices = hexagonIndices.slice(0, maxTestHexagons);
    }
    
    // Store count of hexagons we'll actually process this run
    const hexagonsToProcessCount = hexagonsToProcess.length;
    const processId = `process_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create import log for tracking (graceful degradation - continue if this fails)
    let importLogId: string | null = null;
    let actualApiCalls = 0;
    let tilesCached = 0;  // Renamed from tilesSkipped for clarity
    let tilesFetched = 0;
    let restaurantsFetched = 0;
    const allNewBusinesses: any[] = []; // Track all new businesses across all hexagons
    
    if (cityId) {
      try {
        const estimatedCalls = Math.ceil(hexagonsToProcessCount * 3 * 1.5); // Estimate based on hexagon count
        console.log(`📝 Attempting to create import log for city ${cityId} with ${originalTotalHexagons} total hexagons (processing ${hexagonsToProcessCount})...`);
        importLogId = await createImportLog({
          city_id: cityId,
          total_tiles: originalTotalHexagons,  // FIX: Use original count, not sliced count
          estimated_api_calls: estimatedCalls,
        });
        if (importLogId) {
          console.log(`✅ Created import log ${importLogId} for ${originalTotalHexagons} hexagons`);
        } else {
          console.error(`❌ Failed to create import log - function returned null (check database connection)`);
        }
      } catch (logError) {
        console.error('❌ Exception creating import log (non-fatal, but check DB connection):', {
          error: logError instanceof Error ? logError.message : String(logError),
          stack: logError instanceof Error ? logError.stack : undefined,
          cityId
        });
      }
    } else {
      console.warn('⚠️ No cityId provided - skipping import log creation');
    }
    
    // Initialize processing state
    // Estimate total API calls: ~3 per hexagon (3 search points per hexagon)
    const estimatedTotalApiCalls = hexagonsToProcessCount * 3;
    const processingState: ProcessingState = {
      totalHexagons: hexagonsToProcessCount,
      processedHexagons: 0,
      phase1Total: hexagonsToProcessCount,
      phase1Processed: 0,
      phase2Total: 0,
      phase2Processed: 0,
      isProcessing: true,
      startTime: Date.now(),
      importLogId: importLogId, // Store for failure handling
      actualApiCalls: 0,
      estimatedTotalApiCalls: estimatedTotalApiCalls,
      lastRestaurantCount: 0
    };
    processingStates.set(processId, processingState);
    
    // Use the unified two-phase processing pipeline
    let results: HexagonYelpResult[] = [];
    
    // Note: Validation and duplicate statistics will be tracked when admin approves restaurants
    
    // Both test and real modes now use the complete two-phase algorithm with Yelp API calls
    try {
      // Phase 1: Process hexagons at resolution 7 with Yelp
      const phase1Results: HexagonYelpResult[] = [];
      
      for (let i = 0; i < hexagonsToProcess.length; i++) {
        const h3Id = hexagonsToProcess[i];
        const mapIndex = hexagonIndices[i];
        
        try {
          // STEP 1: Check cache before processing (graceful degradation)
          let yelpResult: HexagonYelpResult | null = null;
          let fromCache = false;
          
          if (cityId) {
            try {
              const cachedHextile = await getValidHextile(h3Id);
              if (cachedHextile && cachedHextile.yelp_total_businesses !== undefined) {
                // Use cached data - reconstruct HexagonYelpResult
                const center = getHextileCenter(h3Id);
                if (center) {
                  // FIX ISSUE 2: Load businesses from staging when using cache
                  const cachedBusinesses = await getStagingBusinessesAsYelpBusinesses(h3Id);
                  
                  yelpResult = {
                    h3Id,
                    totalBusinesses: cachedHextile.yelp_total_businesses,
                    uniqueBusinesses: cachedBusinesses, // Load from staging
                    searchResults: [], // Search results not cached
                    status: cachedHextile.status === 'dense' ? 'dense' : 'fetched',
                    coverageQuality: 'cached'
                  };
                  fromCache = true;
                  tilesCached++;
                  console.log(`✅ Using cached data for hexagon ${h3Id} (${cachedBusinesses.length} businesses loaded from staging)`);
                }
              }
            } catch (cacheError) {
              // Graceful degradation: continue with normal processing if cache check fails
              console.warn(`Cache check failed for ${h3Id} (non-fatal):`, cacheError);
            }
          }
          
          // STEP 2: Process with Yelp API if not cached
          if (!fromCache) {
            yelpResult = await yelpEngine.searchHexagon(h3Id);
            actualApiCalls += 3; // Approximate API calls per hexagon (3 search points)
            tilesFetched++;
            restaurantsFetched += yelpResult.uniqueBusinesses.length;
            
            // Update processing state with API call and restaurant count
            processingState.actualApiCalls = actualApiCalls;
            processingState.lastRestaurantCount = yelpResult.totalBusinesses;
          }
          
          // Ensure we have a valid result
          if (!yelpResult) {
            throw new Error('Failed to get Yelp result for hexagon');
          }
          
          // Update last restaurant count for display (even if cached)
          processingState.lastRestaurantCount = yelpResult.totalBusinesses;
          
          // Add map index to the result
          const resultWithIndex = { ...yelpResult, mapIndex };
          phase1Results.push(resultWithIndex);
          
          // Update hexagon processor with Yelp results
          await hexagonProcessor.processHexagonWithCoverage(h3Id, 7, {
            totalBusinesses: yelpResult.totalBusinesses,
            status: yelpResult.status,
            coverageQuality: yelpResult.coverageQuality
          });
          
          // STEP 3: Hexagons are saved when restaurants are approved (see staging API)
          // This ensures atomic consistency - hexagons only exist if they have approved restaurants
          
          // STEP 4: Restaurants AND hexagons saved to database when admin approves (see staging API)
          // No automatic saving during search - results are returned to frontend for review
          if (yelpResult.uniqueBusinesses && yelpResult.uniqueBusinesses.length > 0) {
            // Track businesses for response (but don't save to staging yet)
            allNewBusinesses.push(...yelpResult.uniqueBusinesses);
          }
          
          // Check if this hexagon needs subdivision
          if (yelpResult.status === 'split' && yelpResult.totalBusinesses > 240) {
            // The subdivision is already handled in YelpSearchEngine.processSearchResults
          }
          
          // Update progress
          processingState.phase1Processed = i + 1;
          processingState.processedHexagons = processingState.phase1Processed;
          
          // Update import log periodically (every 10 hexagons or at end)
          if (importLogId && (i % 10 === 0 || i === hexagonsToProcess.length - 1)) {
            try {
              await updateImportLog(importLogId, {
                processed_tiles: i + 1,
                tiles_cached: tilesCached,
                actual_api_calls: actualApiCalls,
                restaurants_fetched: restaurantsFetched
              });
            } catch (logError) {
              // Non-fatal: continue processing
              console.warn('Failed to update import log (non-fatal):', logError);
            }
          }
          
        } catch (error) {
          console.error(`❌ Phase 1: Error processing hexagon ${h3Id}:`, error);
          phase1Results.push({
            h3Id,
            mapIndex, // Include the map index for correlation
            totalBusinesses: 0,
            uniqueBusinesses: [],
            searchResults: [],
            status: 'failed',
            coverageQuality: 'unknown',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          // Save failed status to database
          if (cityId) {
            try {
              const center = getHextileCenter(h3Id);
              if (center) {
                const resolution = h3.getResolution(h3Id);
                await upsertHextile({
                  h3_id: h3Id,
                  city_id: cityId,
                  status: 'failed',
                  center_lat: center.lat,
                  center_lng: center.lng,
                  resolution: resolution,
                  retry_count: 1
                });
              }
            } catch (saveError) {
              // Non-fatal
              console.warn(`Failed to save failed hextile ${h3Id} (non-fatal):`, saveError);
            }
          }
        }
      }
      
      // Phase 2: Process subdivision queue (resolution 8 hexagons)
      const subdivisionResults = await hexagonProcessor.processSubdivisionQueue();
      const subdivisionCount = subdivisionResults.length;
      processingState.phase2Total = subdivisionCount;
      processingState.totalHexagons = hexagonsToProcessCount + subdivisionCount;
      
      // Process subdivision hexagons with Yelp
      const phase2Results: HexagonYelpResult[] = [];
      let phase2Index = 0;
      for (const subdivisionHex of subdivisionResults) {
        if (subdivisionHex.status === 'fetched') {
          try {
            const h3Id = subdivisionHex.h3Id;
            
            // STEP 1: Check cache before processing (graceful degradation)
            let yelpResult: HexagonYelpResult | null = null;
            let fromCache = false;
            
            if (cityId) {
              try {
                const cachedHextile = await getValidHextile(h3Id);
                if (cachedHextile && cachedHextile.yelp_total_businesses !== undefined) {
                  const center = getHextileCenter(h3Id);
                  if (center) {
                    // FIX ISSUE 2: Load businesses from staging when using cache
                    const cachedBusinesses = await getStagingBusinessesAsYelpBusinesses(h3Id);
                    
                    yelpResult = {
                      h3Id,
                      totalBusinesses: cachedHextile.yelp_total_businesses,
                      uniqueBusinesses: cachedBusinesses, // Load from staging
                      searchResults: [], // Search results not cached
                      status: cachedHextile.status === 'dense' ? 'dense' : 'fetched',
                      coverageQuality: 'cached'
                    };
                    fromCache = true;
                    tilesCached++;
                    console.log(`✅ Using cached data for subdivision hexagon ${h3Id} (${cachedBusinesses.length} businesses loaded from staging)`);
                  }
                }
              } catch (cacheError) {
                console.warn(`Cache check failed for subdivision ${h3Id} (non-fatal):`, cacheError);
              }
            }
            
            // STEP 2: Process with Yelp API if not cached
            if (!fromCache) {
              yelpResult = await yelpEngine.searchHexagon(h3Id);
              actualApiCalls += 3; // Approximate API calls per hexagon
              tilesFetched++;
              restaurantsFetched += yelpResult.uniqueBusinesses.length;
              
              // Update processing state with API call
              processingState.actualApiCalls = actualApiCalls;
            }
            
            // Ensure we have a valid result
            if (!yelpResult) {
              throw new Error('Failed to get Yelp result for subdivision hexagon');
            }
            
            // Update last restaurant count for display (even if cached)
            processingState.lastRestaurantCount = yelpResult.totalBusinesses;
            
            phase2Results.push(yelpResult);
            
            // STEP 3: Phase 2 hexagons are saved when restaurants are approved (see staging API)
            // This ensures atomic consistency - hexagons only exist if they have approved restaurants
            
            // STEP 4: Restaurants AND hexagons saved to database when admin approves (see staging API)
            // No automatic saving during Phase 2 - results are returned to frontend for review
            if (yelpResult.uniqueBusinesses && yelpResult.uniqueBusinesses.length > 0) {
              // Track businesses for response (but don't save to staging yet)
              allNewBusinesses.push(...yelpResult.uniqueBusinesses);
            }
            
            // Update progress
            phase2Index++;
            processingState.phase2Processed = phase2Index;
            processingState.processedHexagons = processingState.phase1Processed + processingState.phase2Processed;
            
            // Update import log periodically
            if (importLogId && phase2Index % 10 === 0) {
              try {
                await updateImportLog(importLogId, {
                  processed_tiles: processingState.phase1Processed + phase2Index,
                  tiles_cached: tilesCached,
                  actual_api_calls: actualApiCalls,
                  restaurants_fetched: restaurantsFetched
                });
              } catch (logError) {
                console.warn('Failed to update import log (non-fatal):', logError);
              }
            }
            
          } catch (error) {
            console.error(`❌ Phase 2: Error processing subdivision hexagon ${subdivisionHex.h3Id}:`, error);
            phase2Results.push({
              h3Id: subdivisionHex.h3Id,
              totalBusinesses: 0,
              uniqueBusinesses: [],
              searchResults: [],
              status: 'failed',
              coverageQuality: 'unknown',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            // Save failed status to database
            if (cityId) {
              try {
                const center = getHextileCenter(subdivisionHex.h3Id);
                if (center) {
                  const resolution = h3.getResolution(subdivisionHex.h3Id);
                  await upsertHextile({
                    h3_id: subdivisionHex.h3Id,
                    city_id: cityId,
                    status: 'failed',
                    center_lat: center.lat,
                    center_lng: center.lng,
                    resolution: resolution,
                    retry_count: 1
                  });
                }
              } catch (saveError) {
                console.warn(`Failed to save failed subdivision hextile (non-fatal):`, saveError);
              }
            }
          }
        }
      }
      
      // Combine all results
      results = [...phase1Results, ...phase2Results];
      
    } catch (error) {
      console.error(`❌ Error in two-phase processing:`, error);
      throw error;
    }

    // Mark processing as complete
    processingState.isProcessing = false;
    
    // Get comprehensive processing statistics and subdivision information
    const processingStats = hexagonProcessor.getProcessingStats();
    const quotaStatus = yelpQuotaManager.getQuotaStatus();
    const subdivisionQueueStatus = hexagonProcessor.getSubdivisionQueueStatus();
    const resultsByResolution = hexagonProcessor.getResultsByResolution();
    const mergedResults = hexagonProcessor.getMergedResults();

    // Clean up processing state after a delay
    setTimeout(() => {
      processingStates.delete(processId);
    }, 60000); // Keep for 1 minute after completion

    // Deduplicate businesses by ID (businesses can appear in multiple hexagons)
    const uniqueBusinessesMap = new Map<string, any>();
    allNewBusinesses.forEach(business => {
      if (business && business.id && !uniqueBusinessesMap.has(business.id)) {
        uniqueBusinessesMap.set(business.id, business);
      }
    });
    const uniqueBusinesses = Array.from(uniqueBusinessesMap.values());
    
    // Update import log as complete with accurate counts (graceful degradation)
    if (importLogId) {
      try {
        const totalProcessed = processingState.phase1Processed + processingState.phase2Processed;
        
        await updateImportLog(importLogId, {
          status: 'complete',
          processed_tiles: totalProcessed,
          tiles_cached: tilesCached,
          actual_api_calls: actualApiCalls,
          restaurants_fetched: restaurantsFetched,
          restaurants_unique: uniqueBusinesses.length,  // Accurate deduplicated count
        });
        console.log(`✅ Marked import log ${importLogId} as complete (${restaurantsFetched} fetched, ${uniqueBusinesses.length} unique)`);
      } catch (logError) {
        console.warn('Failed to mark import log as complete (non-fatal):', logError);
      }
    }

    return NextResponse.json({
      success: true,
      results,
      newBusinesses: uniqueBusinesses, // All unique businesses from search (not yet saved to staging)
      processingStats: {
        ...processingStats,
        restaurantsFetched: restaurantsFetched,
        newRestaurantsCount: uniqueBusinesses.length
      },
      // Include metadata needed for approval workflow
      importLogId: importLogId || null,
      cityId: cityId || null,
      quotaStatus,
      subdivisionQueueStatus,
      resultsByResolution,
      mergedResults,
      testMode,
      limitedHexagons: testMode ? Math.min(hexagons.length, 10) : hexagons.length,
      totalRequested: hexagons.length,
      totalProcessed: processingState.totalHexagons,
      processedAt: new Date().toISOString(),
      // Include cache statistics
      cacheStats: {
        tilesCached,
        tilesFetched,
        actualApiCalls
      }
    });

  } catch (error) {
    // Mark processing as failed
    const processId = Array.from(processingStates.keys()).find(id => processingStates.get(id)?.isProcessing);
    let importLogIdToFail: string | null = null;
    
    if (processId) {
      const state = processingStates.get(processId);
      if (state) {
        state.isProcessing = false;
        importLogIdToFail = state.importLogId || null; // FIX ISSUE 1: Get importLogId from state
        setTimeout(() => processingStates.delete(processId), 60000);
      }
    }
    
    // FIX ISSUE 1: Mark import log as failed (graceful degradation)
    if (importLogIdToFail) {
      try {
        await updateImportLog(importLogIdToFail, {
          status: 'failed',
        });
        console.log(`✅ Marked import log ${importLogIdToFail} as failed`);
      } catch (logError) {
        console.warn('Failed to mark import log as failed (non-fatal):', logError);
      }
    }
    
    console.error('Error processing hexagons:', error);
    return NextResponse.json(
      { error: 'Failed to process hexagons', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

