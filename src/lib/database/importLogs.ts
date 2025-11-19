// Database helper functions for Yelp import logs (yelp_import_logs table)
import { supabaseServer } from '../config/supabaseServer';
import type { YelpImportLog, YelpImportStatus } from '../types';

export interface CreateImportLogInput {
  city_id?: string;
  total_tiles: number;
  estimated_api_calls: number;
  test_mode?: boolean;
}

export interface UpdateImportLogInput {
  status?: YelpImportStatus;
  processed_tiles?: number;
  actual_api_calls?: number;
  restaurants_added?: number;
  tiles_skipped?: number;
  tiles_fetched?: number;
  restaurants_fetched?: number;
  end_time?: string;
}

/**
 * Create a new import log
 * Returns the import log ID, or null on error
 * Note: user_id is set to null as per requirements (no user tracking)
 */
export async function createImportLog(logData: CreateImportLogInput): Promise<string | null> {
  try {
    const { data, error } = await supabaseServer
      .from('yelp_import_logs')
      .insert({
        user_id: null, // No user tracking as per requirements
        city_id: logData.city_id,
        total_tiles: logData.total_tiles,
        estimated_api_calls: logData.estimated_api_calls,
        status: 'running',
        processed_tiles: 0,
        actual_api_calls: 0,
        restaurants_added: 0,
        tiles_skipped: 0,
        tiles_fetched: 0,
        restaurants_fetched: 0,
        start_time: new Date().toISOString()
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
    
    // If status is being updated to complete or failed, set end_time
    if (updates.status === 'complete' || updates.status === 'failed') {
      updateData.end_time = new Date().toISOString();
    }

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
      .select('*')
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

