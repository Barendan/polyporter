// Unified city and state normalization utilities
import type { EnhancedCityResponse } from '../geography/cityTypes';
import type { City, YelpPolygonZone } from '../types';
import { createEnhancedCityResponse } from '../geography/cityUtils';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

// State name to 2-letter code mapping
export const STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'AL',
  'alaska': 'AK',
  'arizona': 'AZ',
  'arkansas': 'AR',
  'california': 'CA',
  'colorado': 'CO',
  'connecticut': 'CT',
  'delaware': 'DE',
  'florida': 'FL',
  'georgia': 'GA',
  'hawaii': 'HI',
  'idaho': 'ID',
  'illinois': 'IL',
  'indiana': 'IN',
  'iowa': 'IA',
  'kansas': 'KS',
  'kentucky': 'KY',
  'louisiana': 'LA',
  'maine': 'ME',
  'maryland': 'MD',
  'massachusetts': 'MA',
  'michigan': 'MI',
  'minnesota': 'MN',
  'mississippi': 'MS',
  'missouri': 'MO',
  'montana': 'MT',
  'nebraska': 'NE',
  'nevada': 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  'ohio': 'OH',
  'oklahoma': 'OK',
  'oregon': 'OR',
  'pennsylvania': 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  'tennessee': 'TN',
  'texas': 'TX',
  'utah': 'UT',
  'vermont': 'VT',
  'virginia': 'VA',
  'washington': 'WA',
  'west virginia': 'WV',
  'wisconsin': 'WI',
  'wyoming': 'WY',
  'district of columbia': 'DC'
};

/**
 * Normalize state input to valid 2-letter code
 * Returns valid uppercase code OR null if invalid
 */
export function normalizeStateCode(stateInput: string): string | null {
  if (!stateInput || typeof stateInput !== 'string') {
    return null;
  }
  
  const trimmed = stateInput.trim();
  const validCodes = Object.values(STATE_NAME_TO_CODE);
  
  // If already 2 uppercase chars, validate it exists
  if (trimmed.length === 2 && trimmed === trimmed.toUpperCase()) {
    return validCodes.includes(trimmed) ? trimmed : null;
  }
  
  // Try mapping lookup (case-insensitive)
  const code = STATE_NAME_TO_CODE[trimmed.toLowerCase()];
  if (code) {
    return code;
  }
  
  // Try uppercase if 2 chars
  if (trimmed.length === 2) {
    const uppercased = trimmed.toUpperCase();
    return validCodes.includes(uppercased) ? uppercased : null;
  }
  
  return null;
}

/**
 * Normalize city name to proper case
 */
export function normalizeCityName(cityName: string): string {
  return cityName
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Parse city input string into normalized city name and state code
 * Handles: "City, State", "City, County, State", "City, State, Country"
 * Returns { cityName, state } or null if invalid
 */
export function parseCityInput(cityInput: string): { cityName: string; state: string } | null {
  if (!cityInput || typeof cityInput !== 'string') {
    return null;
  }

  const parts = cityInput.split(',').map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length < 2) {
    return null;
  }

  const countryNames = ['united states', 'united states of america', 'usa', 'us'];
  
  // State is the last non-country part
  let stateIndex = parts.length - 1;
  let stateCode = normalizeStateCode(parts[stateIndex]);
  
  // If last part is country, try second-to-last
  if (!stateCode && parts.length >= 3) {
    const lastPart = parts[parts.length - 1].toLowerCase();
    if (countryNames.includes(lastPart)) {
      stateIndex = parts.length - 2;
      stateCode = normalizeStateCode(parts[stateIndex]);
    }
  }
  
  if (!stateCode) {
    return null;
  }

  const cityParts = parts.slice(0, stateIndex);
  if (cityParts.length === 0) {
    return null;
  }

  return {
    cityName: normalizeCityName(cityParts.join(' ')),
    state: stateCode
  };
}

/**
 * Convert database city and polygon zone to EnhancedCityResponse
 */
export function dbToEnhancedCityResponse(
  city: City,
  polygonZone: YelpPolygonZone
): EnhancedCityResponse | null {
  try {
    if (!polygonZone.raw_polygon || !polygonZone.buffered_polygon) {
      return null;
    }

    const rawGeoJson = polygonZone.raw_polygon as Feature<Polygon | MultiPolygon>;
    if (!rawGeoJson?.geometry) {
      return null;
    }

    const baseResponse = {
      name: `${city.name}, ${city.state}`,
      bbox: polygonZone.bbox as [number, number, number, number],
      geojson: rawGeoJson,
      osm_id: 0,
      source: polygonZone.source as 'overpass' | 'nominatim'
    };

    return createEnhancedCityResponse(baseResponse);
  } catch (error) {
    console.error('Error converting database city:', error);
    return null;
  }
}

