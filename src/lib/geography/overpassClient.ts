// State bounding box mapping for US cities

// State bounding box mapping for US cities
const STATE_BBOXES: Record<string, [number, number, number, number]> = {
  'AL': [30.2, -88.5, 35.0, -84.9], 'AK': [51.2, -179.1, 71.4, -129.9],
  'AZ': [31.3, -114.8, 37.0, -109.0], 'AR': [33.0, -94.6, 36.5, -89.6],
  'CA': [32.5, -124.5, 42.0, -114.1], 'CO': [37.0, -109.1, 41.0, -102.0],
  'CT': [40.9, -73.7, 42.1, -71.8], 'DE': [38.4, -75.8, 39.8, -75.0],
  'FL': [24.4, -87.6, 31.0, -79.9], 'GA': [30.4, -85.6, 35.0, -80.8],
  'HI': [18.9, -160.3, 22.2, -154.8], 'ID': [41.9, -117.2, 49.0, -111.0],
  'IL': [36.9, -91.5, 42.5, -87.5], 'IN': [37.8, -88.1, 41.8, -84.8],
  'IA': [40.4, -96.6, 43.5, -90.1], 'KS': [37.0, -102.1, 40.0, -94.6],
  'KY': [36.5, -89.6, 39.1, -81.9], 'LA': [29.0, -94.0, 33.0, -88.8],
  'ME': [43.1, -71.1, 47.5, -66.9], 'MD': [37.9, -79.5, 39.7, -75.0],
  'MA': [41.2, -73.5, 42.9, -69.9], 'MI': [41.7, -90.4, 48.3, -82.4],
  'MN': [43.5, -97.2, 49.4, -89.5], 'MS': [30.2, -91.7, 35.0, -88.1],
  'MO': [36.0, -95.8, 40.6, -89.1], 'MT': [44.4, -116.1, 49.0, -104.0],
  'NE': [40.0, -104.1, 43.0, -95.3], 'NV': [35.0, -120.0, 42.0, -114.0],
  'NH': [42.7, -72.6, 45.3, -70.6], 'NJ': [38.9, -75.6, 41.4, -73.9],
  'NM': [31.3, -109.1, 37.0, -103.0], 'NY': [40.5, -79.8, 45.0, -71.8],
  'NC': [33.8, -84.3, 36.6, -75.5], 'ND': [45.9, -104.1, 49.0, -96.6],
  'OH': [38.4, -84.8, 42.0, -80.5], 'OK': [33.6, -103.0, 37.0, -94.4],
  'OR': [42.0, -124.6, 46.3, -116.5], 'PA': [39.7, -80.5, 42.3, -74.7],
  'RI': [41.1, -71.9, 42.0, -71.1], 'SC': [32.0, -83.4, 35.2, -78.5],
  'SD': [42.5, -104.1, 45.9, -96.4], 'TN': [34.9, -90.3, 36.7, -81.6],
  'TX': [26.0, -106.6, 36.5, -93.5], 'UT': [37.0, -114.1, 42.0, -109.0],
  'VT': [42.7, -73.4, 45.0, -71.5], 'VA': [36.5, -83.7, 39.5, -75.2],
  'WA': [45.5, -124.8, 49.0, -116.9], 'WV': [37.2, -82.7, 40.6, -77.7],
  'WI': [42.5, -92.9, 47.1, -86.8], 'WY': [41.0, -111.1, 45.0, -104.0]
};

// Get state bounding box from city input
function getStateBbox(cityInput: string): [number, number, number, number] | null {
  const parts = cityInput.split(', ');
  if (parts.length !== 2) return null;
  
  const stateAbbr = parts[1].trim().toUpperCase();
  const bbox = STATE_BBOXES[stateAbbr];
  
  if (!bbox) return null;
  
  // Return as [minLat, minLon, maxLat, maxLon] for Overpass
  return [bbox[0], bbox[1], bbox[2], bbox[3]];
}

// Strategy 1: Standard City Boundaries (Run First)
export function buildStandardCityQuery(cityName: string, stateCode: string): string {
  const bbox = getStateBbox(stateCode);
  const bboxConstraint = bbox ? `(${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]})` : '';
  const escapedCity = cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  return `
    [out:json][timeout:45];
    (
      relation["boundary"="administrative"]["admin_level"~"^(7|8)$"]["name"~"^${escapedCity}$",i]${bboxConstraint};
      relation["place"="city"]["name"~"^${escapedCity}$",i]${bboxConstraint};
      relation["boundary"="administrative"]["name"~"^${escapedCity}$",i]${bboxConstraint};
    );
    out geom;
  `;
}

// Strategy 2: Comprehensive City Search (Run Second)
export function buildComprehensiveCityQuery(cityName: string, stateCode: string): string {
  const bbox = getStateBbox(stateCode);
  const bboxConstraint = bbox ? `(${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]})` : '';
  const escapedCity = cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  return `
    [out:json][timeout:60];
    (
      relation["boundary"]["name"~"^${escapedCity}$",i]${bboxConstraint};
      relation["place"~"^(city|town|municipality)$"]["name"~"^${escapedCity}$",i]${bboxConstraint};
      way["boundary"]["name"~"^${escapedCity}$",i]${bboxConstraint};
      node["place"~"^(city|town)$"]["name"~"^${escapedCity}$",i]${bboxConstraint};
    );
    out geom;
  `;
}

// Strategy 3: Aggressive Boundary Search (Run Last)
export function buildAggressiveCityQuery(cityName: string, stateCode: string): string {
  const bbox = getStateBbox(stateCode);
  const bboxConstraint = bbox ? `(${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]})` : '';
  const escapedCity = cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  return `
    [out:json][timeout:90];
    (
      relation["name"~"^${escapedCity}$",i]${bboxConstraint};
      way["name"~"^${escapedCity}$",i]["boundary"]${bboxConstraint};
      way["name"~"^${escapedCity}$",i]["place"]${bboxConstraint};
      node["name"~"^${escapedCity}$",i]["place"~"^(city|town|village|hamlet)$"]${bboxConstraint};
      relation["name"~"^${escapedCity}$",i]["landuse"~"^(residential|municipal)$"]${bboxConstraint};
    );
    out geom;
  `;
}

// Execute Overpass query with retry logic
async function executeOverpassQuery(query: string, strategyName: string): Promise<{ elements?: Array<{ id: number; type: string; tags: Record<string, string>; members?: Array<{ type: string; ref: number; role: string; geometry?: number[][] }> }> }> {
  const maxRetries = 3;
  const baseDelay = 1000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'CityPolygonViewer/0.1 (demo@example.com)'
        },
        body: query
      });

      if (!response.ok) {
        if (response.status === 429) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`Overpass API error: ${response.status}`);
      }

      const data = await response.json();
      return data;
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`All ${maxRetries} attempts failed for ${strategyName}`);
}

// Execute all three strategies in order
export async function executeOverpassStrategies(cityName: string, stateCode: string): Promise<{ elements?: Array<{ id: number; type: string; tags: Record<string, string>; members?: Array<{ type: string; ref: number; role: string; geometry?: number[][] }> }> } | null> {
  const cityNameOnly = cityName.split(',')[0].trim();
  
  // Strategy 1: Standard City Boundaries
  try {
    const query1 = buildStandardCityQuery(cityNameOnly, stateCode);
    const result1 = await executeOverpassQuery(query1, 'Strategy 1');
    
    if (result1.elements && result1.elements.length > 0) {
      return result1;
    }
  } catch (error) {
    // Strategy 1 failed, continue to next
  }
  
  // Strategy 2: Comprehensive City Search
  try {
    const query2 = buildComprehensiveCityQuery(cityNameOnly, stateCode);
    const result2 = await executeOverpassQuery(query2, 'Strategy 2');
    
    if (result2.elements && result2.elements.length > 0) {
      return result2;
    }
  } catch (error) {
    // Strategy 2 failed, continue to next
  }
  
  // Strategy 3: Aggressive Boundary Search
  try {
    const query3 = buildAggressiveCityQuery(cityNameOnly, stateCode);
    const result3 = await executeOverpassQuery(query3, 'Strategy 3');
    
    if (result3.elements && result3.elements.length > 0) {
      return result3;
    }
  } catch (error) {
    // Strategy 3 failed
  }
  
  return null;
}
