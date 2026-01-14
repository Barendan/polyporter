import type { Polygon, MultiPolygon, Feature } from 'geojson';

// Overpass API response types
export interface OverpassElement {
  type: string;
  id: number;
  tags: Record<string, string>;
  geometry?: number[][];
  members?: Array<{
    type: string;
    ref: number;
    role: string;
    geometry?: number[][];
  }>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

// Nominatim fallback types
export interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: string[];
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  geojson?: Polygon | MultiPolygon;
}

// Unified response type
export interface CityResponse {
  name: string;
  bbox: [number, number, number, number];
  geojson: Feature<Polygon | MultiPolygon>;
  osm_id: number;
  source: 'overpass' | 'nominatim';
}

// State bounding boxes for US cities (hardcoded for performance)
export const STATE_BBOXES: Record<string, [number, number, number, number]> = {
  'Alabama': [30.2, -88.5, 35.0, -84.9],
  'Alaska': [51.2, -179.1, 71.4, -129.9],
  'Arizona': [31.3, -114.8, 37.0, -109.0],
  'Arkansas': [33.0, -94.6, 36.5, -89.6],
  'California': [32.5, -124.5, 42.0, -114.1],
  'Colorado': [37.0, -109.1, 41.0, -102.0],
  'Connecticut': [40.9, -73.7, 42.1, -71.8],
  'Delaware': [38.4, -75.8, 39.8, -75.0],
  'Florida': [24.4, -87.6, 31.0, -79.9],
  'Georgia': [30.4, -85.6, 35.0, -80.8],
  'Hawaii': [18.9, -160.3, 22.2, -154.8],
  'Idaho': [41.9, -117.2, 49.0, -111.0],
  'Illinois': [36.9, -91.5, 42.5, -87.5],
  'Indiana': [37.8, -88.1, 41.8, -84.8],
  'Iowa': [40.4, -96.6, 43.5, -90.1],
  'Kansas': [37.0, -102.1, 40.0, -94.6],
  'Kentucky': [36.5, -89.6, 39.1, -81.9],
  'Louisiana': [29.0, -94.0, 33.0, -88.8],
  'Maine': [43.1, -71.1, 47.5, -66.9],
  'Maryland': [37.9, -79.5, 39.7, -75.0],
  'Massachusetts': [41.2, -73.5, 42.9, -69.9],
  'Michigan': [41.7, -90.4, 48.3, -82.4],
  'Minnesota': [43.5, -97.2, 49.4, -89.5],
  'Mississippi': [30.2, -91.7, 35.0, -88.1],
  'Missouri': [36.0, -95.8, 40.6, -89.1],
  'Montana': [44.4, -116.1, 49.0, -104.0],
  'Nebraska': [40.0, -104.1, 43.0, -95.3],
  'Nevada': [35.0, -120.0, 42.0, -114.0],
  'New Hampshire': [42.7, -72.6, 45.3, -70.6],
  'New Jersey': [38.9, -75.6, 41.4, -73.9],
  'New Mexico': [31.3, -109.1, 37.0, -103.0],
  'New York': [40.5, -79.8, 45.0, -71.8],
  'North Carolina': [33.8, -84.3, 36.6, -75.5],
  'North Dakota': [45.9, -104.1, 49.0, -96.6],
  'Ohio': [38.4, -84.8, 42.0, -80.5],
  'Oklahoma': [33.6, -103.0, 37.0, -94.4],
  'Oregon': [42.0, -124.6, 46.3, -116.5],
  'Pennsylvania': [39.7, -80.5, 42.3, -74.7],
  'Rhode Island': [41.1, -71.9, 42.0, -71.1],
  'South Carolina': [32.0, -83.4, 35.2, -78.5],
  'South Dakota': [42.5, -104.1, 45.9, -96.4],
  'Tennessee': [34.9, -90.3, 36.7, -81.6],
  'Texas': [26.0, -106.6, 36.5, -93.5],
  'Utah': [37.0, -114.1, 42.0, -109.0],
  'Vermont': [42.7, -73.4, 45.0, -71.5],
  'Virginia': [36.5, -83.7, 39.5, -75.2],
  'Washington': [45.5, -124.8, 49.0, -116.9],
  'West Virginia': [37.2, -82.7, 40.6, -77.7],
  'Wisconsin': [42.5, -92.9, 47.1, -86.8],
  'Wyoming': [41.0, -111.1, 45.0, -104.0]
};

// State abbreviation to full name mapping
export const STATE_ABBR_TO_NAME: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};

// H3 Grid Statistics
export interface GridStats {
  total_hexagons: number;
  resolution: number;
  avg_hexagon_size_km: number;
  coverage_area_km2: number;
}

// Enhanced city response with buffered polygon and H3 grid
export interface EnhancedCityResponse extends CityResponse {
  buffered_polygon: Feature<Polygon | MultiPolygon>;
  h3_grid: string[];
  grid_stats: GridStats;
  city_id: string | null; // City UUID for cache operations (always present, null if not cached)
  city_query: string; // City query string in "City, ST" format (e.g., "Kendall, FL")
  traceId?: string; // Optional request/response trace identifier for debugging
  cachedRestaurantData?: { // Metadata about cached restaurant data
    available: boolean;
    count: number;
    hexagonCount: number;
  };
}

