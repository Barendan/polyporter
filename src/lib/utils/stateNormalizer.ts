// State name to 2-letter code mapping for normalization
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
 * Normalize state input to 2-letter code
 * Handles: "FL", "Florida", "florida", "Fl", etc.
 * Returns uppercase 2-letter code or original if not recognized
 */
export function normalizeStateCode(stateInput: string): string {
  const trimmed = stateInput.trim();
  
  // If already 2 characters and uppercase, assume it's a code
  if (trimmed.length === 2 && trimmed === trimmed.toUpperCase()) {
    return trimmed;
  }
  
  // Try to find in mapping (case-insensitive)
  const normalized = trimmed.toLowerCase();
  const code = STATE_NAME_TO_CODE[normalized];
  
  if (code) {
    return code;
  }
  
  // If input is 2 characters but not uppercase, uppercase it
  if (trimmed.length === 2) {
    return trimmed.toUpperCase();
  }
  
  // Return original if we can't normalize (will cause lookup to fail, which is fine)
  console.warn(`⚠️ Could not normalize state code: "${stateInput}" - using as-is`);
  return trimmed;
}

/**
 * Normalize city name
 * - Trim whitespace
 * - Capitalize first letter of each word
 */
export function normalizeCityName(cityName: string): string {
  return cityName
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

