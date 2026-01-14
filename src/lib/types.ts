// TypeScript types matching your Supabase schema

export type YelpHextileStatus = 'queued' | 'fetched' | 'skipped' | 'dense' | 'failed';
export type YelpImportStatus = 'running' | 'paused' | 'complete' | 'failed';
export type YelpStagingStatus = 'new' | 'duplicate' | 'approved' | 'rejected';
export type YelpPolygonSource = 'overpass' | 'osm';

export interface City {
  id: string;
  name: string;
  state: string;
  country: string;
  polygon_area_km2?: number;
  created_at: string;
}

export interface YelpPolygonZone {
  id: string;
  source: YelpPolygonSource;
  city_id: string;
  raw_polygon: unknown; // GeoJSON
  buffered_polygon: unknown; // GeoJSON
  bbox: number[];
  last_scraped_at?: string;
  created_at: string;
}

export interface YelpHextile {
  h3_id: string;
  city_id: string;
  status: YelpHextileStatus;
  center_lat: number;
  center_lng: number;
  yelp_total_businesses?: number;  // Total found from Yelp (immutable after first set)
  staged?: number;                 // Count of restaurants staged (increments)
  resolution: number;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface YelpStaging {
  id: string;
  status: YelpStagingStatus;
  data: unknown; // Yelp business data
  h3_id: string;
  city_id: string;
  yelp_import_log: string;
  created_at: string;
}

export interface YelpImportLog {
  id: string;
  status: YelpImportStatus;
  city_id?: string;
  
  // Tile metrics
  total_tiles: number;                   // All hexagons in city (original count)
  processed_tiles: number;               // How many processed this run
  tiles_cached: number;                  // From cache (no API call needed)
  
  // API metrics
  estimated_api_calls: number;
  actual_api_calls: number;
  
  // Restaurant funnel metrics
  restaurants_fetched: number;           // Raw from Yelp (with cross-hexagon dupes)
  restaurants_unique: number;            // After cross-hexagon deduplication
  restaurants_staged: number;            // Saved to staging table
  duplicates_existing: number;           // Already in DB from previous imports
  
  created_at: string;
  updated_at: string;
}

// Helper types for database operations
export interface CreateCityInput {
  name: string;
  state: string;
  country: string;
  polygon_area_km2?: number;
}

export interface CreatePolygonZoneInput {
  city_id: string;
  source: YelpPolygonSource;
  raw_polygon: unknown;
  buffered_polygon: unknown;
  bbox: number[];
}
