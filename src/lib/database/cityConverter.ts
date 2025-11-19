// Helper functions to convert between database format and app format
import type { EnhancedCityResponse } from '../geography/cityTypes';
import type { City, YelpPolygonZone } from '../types';
import { createEnhancedCityResponse } from '../geography/cityUtils';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { normalizeStateCode, normalizeCityName, STATE_NAME_TO_CODE } from '../utils/stateNormalizer';

/**
 * Convert database city and polygon zone to EnhancedCityResponse
 * This reconstructs the EnhancedCityResponse from cached database data
 */
export function dbToEnhancedCityResponse(
  city: City,
  polygonZone: YelpPolygonZone
): EnhancedCityResponse | null {
  try {
    // Validate that we have the required polygon data
    if (!polygonZone.raw_polygon || !polygonZone.buffered_polygon) {
      console.error('Missing polygon data in database');
      return null;
    }

    // Convert raw_polygon to GeoJSON Feature
    const rawGeoJson = polygonZone.raw_polygon as Feature<Polygon | MultiPolygon>;
    if (!rawGeoJson || !rawGeoJson.geometry) {
      console.error('Invalid raw_polygon format in database');
      return null;
    }

    // Create base CityResponse from database data
    // Construct name as "City, State" format to match API response format
    // This ensures cached data can be parsed correctly by parseCityInput()
    const baseResponse = {
      name: `${city.name}, ${city.state}`,
      bbox: polygonZone.bbox as [number, number, number, number],
      geojson: rawGeoJson,
      osm_id: 0, // We don't store OSM ID in cities table, use 0 as placeholder
      source: polygonZone.source as 'overpass' | 'nominatim'
    };

    // Use createEnhancedCityResponse to generate H3 grid and stats
    // This will regenerate the grid, which is fine since it's deterministic
    const enhancedResponse = createEnhancedCityResponse(baseResponse);

    return enhancedResponse;
  } catch (error) {
    console.error('Error converting database city to EnhancedCityResponse:', error);
    return null;
  }
}

/**
 * Extract city name and state from input string
 * Handles multiple formats:
 * - "City, State" (2 parts)
 * - "City, County, State" (3 parts)
 * - "City, County, State, Country" (4+ parts)
 * Normalizes state to 2-letter code and city name to proper case
 * Returns { cityName, state } or null if format is invalid
 */
export function parseCityInput(cityInput: string): { cityName: string; state: string } | null {
  if (!cityInput || typeof cityInput !== 'string') {
    return null;
  }

  // Handle both ", " and "," separators
  const parts = cityInput.includes(', ') 
    ? cityInput.split(', ').map(p => p.trim())
    : cityInput.includes(',')
    ? cityInput.split(',').map(p => p.trim())
    : null;
    
  if (!parts || parts.length < 2) {
    return null;
  }

  // Smart extraction: find the state (usually last or second-to-last part)
  // Strategy: check each part from the end to see if it's a state
  let statePart: string | null = null;
  let stateIndex = -1;

  // Check from the end backwards (state is usually near the end, before country)
  // Skip common country names that might be at the end
  const countryNames = ['united states', 'united states of america', 'usa', 'us'];
  
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim();
    const lowerPart = part.toLowerCase();
    
    // Skip if it's a country name
    if (countryNames.includes(lowerPart)) {
      continue;
    }
    
    // Check if this part is a valid state (by name or code)
    const normalizedState = normalizeStateCode(part);
    
    // Validate: normalized state should be 2 uppercase letters
    // AND either the original part was a known state name, or it's already a 2-letter code
    if (normalizedState.length === 2 && normalizedState === normalizedState.toUpperCase()) {
      // Check if original part maps to a state (full name) or is already a 2-letter code
      if (STATE_NAME_TO_CODE[lowerPart] || (part.length === 2 && part === part.toUpperCase())) {
        statePart = normalizedState;
        stateIndex = i;
        break;
      }
    }
  }

  // Fallback: if we couldn't identify state, assume second-to-last part is state
  // (last part might be country)
  if (!statePart && parts.length >= 2) {
    // Try second-to-last first (common pattern: City, County, State, Country)
    if (parts.length >= 3) {
      const secondToLast = parts[parts.length - 2];
      const normalized = normalizeStateCode(secondToLast);
      if (normalized.length === 2 && normalized === normalized.toUpperCase()) {
        statePart = normalized;
        stateIndex = parts.length - 2;
      }
    }
    
    // If still no state, try last part
    if (!statePart) {
      statePart = normalizeStateCode(parts[parts.length - 1]);
      stateIndex = parts.length - 1;
    }
  }

  if (!statePart) {
    return null;
  }

  // City is everything before the state
  const cityParts = parts.slice(0, stateIndex);
  if (cityParts.length === 0) {
    return null;
  }

  // Join city parts (handles cases like "New York" or "Fort Lauderdale")
  const cityName = normalizeCityName(cityParts.join(' '));

  return {
    cityName,
    state: statePart
  };
}

