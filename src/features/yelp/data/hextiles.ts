// Database helper functions for hexagon tiles (yelp_hextiles table)
import { supabaseServer } from '@/shared/config/supabaseServer';
import type { YelpHextile, YelpHextileStatus } from '@/shared/types';
import * as h3 from 'h3-js';

export interface CreateHextileInput {
  h3_id: string;
  city_id: string;
  status: YelpHextileStatus;
  center_lat: number;
  center_lng: number;
  yelp_total_businesses?: number;
  staged?: number;  // NEW: Count of restaurants staged
  resolution: number;
  retry_count?: number;
}

export interface UpdateHextileInput {
  status?: YelpHextileStatus;
  yelp_total_businesses?: number;  // Note: Should not be updated after initial creation
  staged?: number;  // NEW: Allow staged to be updated
  retry_count?: number;
}

/**
 * Get hexagon tile by H3 ID
 * Returns null if not found
 */
export async function getHextile(h3Id: string): Promise<YelpHextile | null> {
  try {
    const { data, error } = await supabaseServer
      .from('yelp_hextiles')
      .select('*')
      .eq('h3_id', h3Id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching hextile from database:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception fetching hextile from database:', error);
    return null;
  }
}

/**
 * Check if hexagon is already processed and still valid (within 30 days)
 * Returns the hextile if valid, null otherwise
 */
export async function getValidHextile(h3Id: string): Promise<YelpHextile | null> {
  try {
    const hextile = await getHextile(h3Id);
    
    if (!hextile) {
      return null;
    }

    // Check if data is still valid (within 30 days)
    const createdAt = new Date(hextile.created_at);
    const now = new Date();
    const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceCreation > 30) {
      // Cache expired, return null to trigger re-fetch
      return null;
    }

    // Only return if status indicates successful processing
    if (hextile.status === 'fetched' || hextile.status === 'dense') {
      return hextile;
    }

    // For other statuses (queued, failed, skipped), don't use cache
    return null;
  } catch (error) {
    console.error('Exception checking valid hextile:', error);
    return null;
  }
}

/**
 * Create or update hexagon tile
 * Returns the hextile ID, or null on error
 */
export async function upsertHextile(hextileData: CreateHextileInput): Promise<string | null> {
  try {
    // Check if hextile already exists
    const existing = await getHextile(hextileData.h3_id);
    
    if (existing) {
      // Update existing hextile
      // DO NOT update yelp_total_businesses - it's immutable after first set
      const updateData: UpdateHextileInput = {
        status: hextileData.status,
        staged: hextileData.staged,  // Allow staged to be updated
        retry_count: hextileData.retry_count ?? existing.retry_count
      };

      const { data, error } = await supabaseServer
        .from('yelp_hextiles')
        .update(updateData)
        .eq('h3_id', hextileData.h3_id)
        .select('h3_id')
        .single();

      if (error) {
        console.error('Error updating hextile in database:', error);
        return null;
      }

      return data.h3_id;
    } else {
      // Create new hextile
      const { data, error } = await supabaseServer
        .from('yelp_hextiles')
        .insert({
          h3_id: hextileData.h3_id,
          city_id: hextileData.city_id,
          status: hextileData.status,
          center_lat: hextileData.center_lat,
          center_lng: hextileData.center_lng,
          yelp_total_businesses: hextileData.yelp_total_businesses,
          staged: hextileData.staged ?? 0,  // Default to 0 if not provided
          resolution: hextileData.resolution,
          retry_count: hextileData.retry_count ?? 0
        })
        .select('h3_id')
        .single();

      if (error) {
        console.error('Error creating hextile in database:', error);
        return null;
      }

      return data.h3_id;
    }
  } catch (error) {
    console.error('Exception upserting hextile in database:', error);
    return null;
  }
}

/**
 * Get center coordinates from H3 ID
 * Helper function to extract lat/lng from hexagon
 */
export function getHextileCenter(h3Id: string): { lat: number; lng: number } | null {
  try {
    const [lat, lng] = h3.cellToLatLng(h3Id);
    return { lat, lng };
  } catch (error) {
    console.error('Error getting hextile center:', error);
    return null;
  }
}

/**
 * Get all hextiles for a city
 * Returns array of hextiles, or empty array on error
 */
export async function getHextilesByCity(cityId: string): Promise<YelpHextile[]> {
  try {
    const { data, error } = await supabaseServer
      .from('yelp_hextiles')
      .select('*')
      .eq('city_id', cityId);

    if (error) {
      console.error('Error fetching hextiles by city from database:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching hextiles by city from database:', error);
    return [];
  }
}

/**
 * Get hextiles by status for a city
 * Useful for tracking processing progress
 */
export async function getHextilesByStatus(
  cityId: string,
  status: YelpHextileStatus
): Promise<YelpHextile[]> {
  try {
    const { data, error } = await supabaseServer
      .from('yelp_hextiles')
      .select('*')
      .eq('city_id', cityId)
      .eq('status', status);

    if (error) {
      console.error('Error fetching hextiles by status from database:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching hextiles by status from database:', error);
    return [];
  }
}

