// Database helper functions for cities and polygon zones
import { supabaseServer } from '../config/supabaseServer';
import type { City, YelpPolygonZone, CreateCityInput, CreatePolygonZoneInput } from '../../lib/types';
import { normalizeCityName, normalizeStateCode } from '../utils/cityNormalizer';

/**
 * Get city by name and state
 * Returns null if not found
 */
export async function getCityByName(name: string, state: string): Promise<City | null> {
  try {
    // Normalize inputs (defense-in-depth)
    const normalizedName = normalizeCityName(name);
    const normalizedState = normalizeStateCode(state);
    
    if (!normalizedState) {
      return null;
    }
    
    const { data, error } = await supabaseServer
      .from('cities')
      .select('*')
      .ilike('name', normalizedName)  // Case-insensitive comparison
      .eq('state', normalizedState)
      .maybeSingle();

    if (error) {
      console.error('Error fetching city from database:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception fetching city from database:', error);
    return null;
  }
}

/**
 * Create a new city record or get existing one
 * Checks for existing city first to prevent duplicates
 * Returns the city ID, or null on error
 */
export async function createCity(cityData: CreateCityInput): Promise<string | null> {
  try {
    // Normalize inputs (defense-in-depth)
    const normalizedName = normalizeCityName(cityData.name);
    const normalizedState = normalizeStateCode(cityData.state);
    
    if (!normalizedState) {
      return null;
    }
    
    // First, check if city already exists (with normalized values)
    const existing = await getCityByName(normalizedName, normalizedState);
    if (existing) {
      console.log(`✅ City already exists in database: ${normalizedName}, ${normalizedState} (ID: ${existing.id})`);
      return existing.id;
    }

    // City doesn't exist, create it with normalized values
    const { data, error } = await supabaseServer
      .from('cities')
      .insert({
        name: normalizedName,
        state: normalizedState,
        country: cityData.country,
        polygon_area_km2: cityData.polygon_area_km2
      })
      .select('id')
      .single();

    if (error) {
      // Check if error is due to duplicate (race condition)
      if (error.code === '23505') { // Unique constraint violation
        console.log(`⚠️ City was created by another process, fetching existing...`);
        const existingAfter = await getCityByName(normalizedName, normalizedState);
        if (existingAfter) {
          return existingAfter.id;
        }
      }
      console.error('Error creating city in database:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return null;
    }

    console.log(`✅ Created new city in database: ${normalizedName}, ${normalizedState} (ID: ${data.id})`);
    return data.id;
  } catch (error) {
    console.error('Exception creating city in database:', error);
    return null;
  }
}

/**
 * Get polygon zone for a city
 * Returns null if not found
 */
export async function getPolygonZone(cityId: string): Promise<YelpPolygonZone | null> {
  try {
    const { data, error } = await supabaseServer
      .from('yelp_polygon_zones')
      .select('*')
      .eq('city_id', cityId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching polygon zone from database:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception fetching polygon zone from database:', error);
    return null;
  }
}

/**
 * Create or update polygon zone for a city
 * Returns the polygon zone ID, or null on error
 */
export async function upsertPolygonZone(zoneData: CreatePolygonZoneInput): Promise<string | null> {
  try {
    // Check if polygon zone already exists
    const existing = await getPolygonZone(zoneData.city_id);
    
    if (existing) {
      // Update existing zone
      const { data, error } = await supabaseServer
        .from('yelp_polygon_zones')
        .update({
          source: zoneData.source,
          raw_polygon: zoneData.raw_polygon,
          buffered_polygon: zoneData.buffered_polygon,
          bbox: zoneData.bbox,
          last_scraped_at: new Date().toISOString()
        })
        .eq('city_id', zoneData.city_id)
        .select('id')
        .single();

      if (error) {
        console.error('Error updating polygon zone in database:', error);
        return null;
      }

      return data.id;
    } else {
      // Create new zone
      const { data, error } = await supabaseServer
        .from('yelp_polygon_zones')
        .insert({
          city_id: zoneData.city_id,
          source: zoneData.source,
          raw_polygon: zoneData.raw_polygon,
          buffered_polygon: zoneData.buffered_polygon,
          bbox: zoneData.bbox,
          last_scraped_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating polygon zone in database:', error);
        return null;
      }

      return data.id;
    }
  } catch (error) {
    console.error('Exception upserting polygon zone in database:', error);
    return null;
  }
}

/**
 * Get complete city data with polygon zone
 * Returns null if city or polygon zone not found
 */
export async function getCityWithPolygon(name: string, state: string): Promise<{
  city: City;
  polygonZone: YelpPolygonZone;
} | null> {
  try {
    const city = await getCityByName(name, state);
    if (!city) {
      return null;
    }

    const polygonZone = await getPolygonZone(city.id);
    if (!polygonZone) {
      return null;
    }

    return { city, polygonZone };
  } catch (error) {
    console.error('Exception getting city with polygon:', error);
    return null;
  }
}

