// Database helper functions for Yelp import logs (yelp_import_logs table)
import { supabaseServer } from '../config/supabaseServer';
import type { YelpImportLog, YelpImportStatus } from '../types';

export interface CreateImportLogInput {
  city_id?: string;
  total_tiles: number;                   // Original city hexagon count
  estimated_api_calls: number;
}

export interface UpdateImportLogInput {
  status?: YelpImportStatus;
  processed_tiles?: number;
  tiles_cached?: number;                 // Renamed from tiles_skipped
  actual_api_calls?: number;
  restaurants_fetched?: number;
  restaurants_unique?: number;
  restaurants_staged?: number;
  duplicates_existing?: number;
}

/**
 * Create a new import log
 * Returns the import log ID, or null on error
 */
export async function createImportLog(logData: CreateImportLogInput): Promise<string | null> {
  try {
    const { data, error } = await supabaseServer
      .from('yelp_import_logs')
      .insert({
        city_id: logData.city_id,
        total_tiles: logData.total_tiles,
        estimated_api_calls: logData.estimated_api_calls,
        status: 'running',
        processed_tiles: 0,
        tiles_cached: 0,
        actual_api_calls: 0,
        restaurants_fetched: 0,
        restaurants_unique: 0,
        restaurants_staged: 0,
        duplicates_existing: 0,
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ Error creating import log in database:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        fullError: error
      });
      return null;
    }

    console.log(`✅ Successfully created import log: ${data.id}`);
    return data.id;
  } catch (error) {
    console.error('❌ Exception creating import log in database:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return null;
  }
}

/**
 * Update an existing import log
 * Returns true on success, false on error
 */
export async function updateImportLog(
  logId: string,
  updates: UpdateImportLogInput
): Promise<boolean> {
  try {
    const updateData: Record<string, unknown> = { ...updates };

    const { error } = await supabaseServer
      .from('yelp_import_logs')
      .update(updateData)
      .eq('id', logId);

    if (error) {
      console.error('❌ Error updating import log in database:', {
        logId,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        updates
      });
      return false;
    }

    console.log(`✅ Successfully updated import log: ${logId}`);
    return true;
  } catch (error) {
    console.error('❌ Exception updating import log in database:', {
      logId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}


/**
 * Increment the staged count for an import log
 * Used when restaurants are saved to staging
 */
export async function incrementStagedCount(
  logId: string,
  count: number
): Promise<boolean> {
  try {
    const { data: current } = await supabaseServer
      .from('yelp_import_logs')
      .select('restaurants_staged')
      .eq('id', logId)
      .single();

    if (!current) {
      console.error('❌ Import log not found for increment staged count:', logId);
      return false;
    }

    const { error } = await supabaseServer
      .from('yelp_import_logs')
      .update({ restaurants_staged: (current.restaurants_staged || 0) + count })
      .eq('id', logId);

    if (error) {
      console.error('❌ Error incrementing staged count:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Exception incrementing staged count:', error);
    return false;
  }
}

/**
 * Increment the duplicates count for an import log
 */
export async function incrementDuplicatesCount(
  logId: string,
  count: number
): Promise<boolean> {
  try {
    const { data: current } = await supabaseServer
      .from('yelp_import_logs')
      .select('duplicates_existing')
      .eq('id', logId)
      .single();

    if (!current) {
      console.error('❌ Import log not found for increment duplicates count:', logId);
      return false;
    }

    const { error } = await supabaseServer
      .from('yelp_import_logs')
      .update({ duplicates_existing: (current.duplicates_existing || 0) + count })
      .eq('id', logId);

    if (error) {
      console.error('❌ Error incrementing duplicates count:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Exception incrementing duplicates count:', error);
    return false;
  }
}


/**
 * Get import log by ID
 * Returns the import log, or null if not found
 */
export async function getImportLog(logId: string): Promise<YelpImportLog | null> {
  try {
    const { data, error } = await supabaseServer
      .from('yelp_import_logs')
      .select('*')
      .eq('id', logId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching import log from database:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception fetching import log from database:', error);
    return null;
  }
}

/**
 * Get all import logs for a city
 * Returns array of import logs, or empty array on error
 */
export async function getImportLogsByCity(cityId: string): Promise<YelpImportLog[]> {
  try {
    const { data, error } = await supabaseServer
      .from('yelp_import_logs')
      .select(`
        *,
        cities (
          name,
          state
        )
      `)
      .eq('city_id', cityId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching import logs by city from database:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching import logs by city from database:', error);
    return [];
  }
}

/**
 * Get all import logs, ordered by most recent
 * Returns array of import logs, or empty array on error
 * 
 * @param limit - Optional limit on number of logs to return (default: 50)
 */
export async function getAllImportLogs(limit: number = 50): Promise<YelpImportLog[]> {
  try {
    const { data, error } = await supabaseServer
      .from('yelp_import_logs')
      .select(`
        *,
        cities (
          name,
          state
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching all import logs from database:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching all import logs from database:', error);
    return [];
  }
}