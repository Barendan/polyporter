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
  yelp_total_businesses?: number;
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
  user_id?: string;
  total_tiles: number;
  processed_tiles: number;
  estimated_api_calls: number;
  actual_api_calls: number;
  restaurants_added: number;
  city_id?: string;
  start_time?: string;
  end_time?: string;
  tiles_skipped: number;
  tiles_fetched: number;
  restaurants_fetched: number;
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
