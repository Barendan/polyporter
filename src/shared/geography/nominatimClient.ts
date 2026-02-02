// Nominatim API client for fetching city boundaries
import type { CityResponse, NominatimResult } from './cityTypes';
import { pickBestNominatimResult, normalizeBbox } from './cityUtils';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

// Track last Nominatim request time for rate limiting
let lastNominatimRequestTime: number = 0;
const NOMINATIM_MIN_DELAY_MS = 1000; // 1 second minimum between requests (OSM usage policy)

/**
 * Ensure rate limiting compliance for Nominatim API
 * OSM usage policy requires at least 1 second between requests
 */
async function ensureRateLimit(): Promise<void> {
  const timeSinceLastRequest = Date.now() - lastNominatimRequestTime;
  if (timeSinceLastRequest < NOMINATIM_MIN_DELAY_MS) {
    const delayNeeded = NOMINATIM_MIN_DELAY_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delayNeeded));
  }
  lastNominatimRequestTime = Date.now();
}

/**
 * Build Nominatim API URL with query parameters
 */
function buildNominatimURL(cityName: string): string {
  const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
  nominatimUrl.searchParams.set('format', 'jsonv2');
  nominatimUrl.searchParams.set('polygon_geojson', '1');
  nominatimUrl.searchParams.set('addressdetails', '0');
  nominatimUrl.searchParams.set('q', cityName);
  return nominatimUrl.toString();
}

/**
 * Parse Nominatim API response into our unified CityResponse format
 */
function parseNominatimResponse(bestResult: NominatimResult): CityResponse {
  // Convert to our unified format
  const geojson: Feature<Polygon | MultiPolygon> = {
    type: 'Feature',
    geometry: bestResult.geojson,
    properties: {
      name: bestResult.display_name,
      admin_level: bestResult.class === 'boundary' ? '8' : undefined,
      place: bestResult.type,
      osm_id: bestResult.osm_id
    }
  };

  return {
    name: bestResult.display_name,
    bbox: normalizeBbox(bestResult.boundingbox),
    geojson,
    osm_id: bestResult.osm_id,
    source: 'nominatim'
  };
}

/**
 * Fetch city boundary data from Nominatim API
 * Returns CityResponse on success, null on failure
 * 
 * @param cityName - City name to search for (e.g., "Portland, OR")
 * @returns CityResponse object or null if not found
 */
export async function fetchCityFromNominatim(cityName: string): Promise<CityResponse | null> {
  try {
    // Rate limiting: Ensure at least 1 second between requests
    await ensureRateLimit();

    // Build and execute request
    const url = buildNominatimURL(cityName);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CityPolygonViewer/0.1 (https://github.com/barendan/cylone2; starfruit.global@gmail.com)',
        'Accept': 'application/json',
      },
    });

    // Check content type before parsing
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!response.ok) {
      // Handle 403 explicitly (blocked/forbidden)
      if (response.status === 403) {
        const errorText = isJson 
          ? await response.json().catch(() => 'Unable to parse error')
          : await response.text().catch(() => 'Unable to read error');
        const preview = typeof errorText === 'string' ? errorText.substring(0, 100).replace(/\s+/g, ' ') : 'N/A';
        console.error(`Nominatim blocked (403) for "${cityName}": ${preview}`);
        return null; // Blocked, skip to next strategy
      }
      
      // Handle 429 (rate limited)
      if (response.status === 429) {
        console.warn(`Nominatim rate limited (429) for "${cityName}"`);
        return null; // Rate limited, skip to next strategy
      }
      
      // Handle other errors
      const errorText = isJson
        ? await response.json().catch(() => 'Unable to parse error')
        : await response.text().catch(() => 'Unable to read error');
      const preview = typeof errorText === 'string' ? errorText.substring(0, 100).replace(/\s+/g, ' ') : 'N/A';
      console.error(`Nominatim error (${response.status}) for "${cityName}": ${preview}`);
      throw new Error(`Nominatim responded with status: ${response.status}`);
    }

    // Parse JSON only if content type indicates JSON
    if (!isJson) {
      const textResponse = await response.text();
      const preview = textResponse.substring(0, 100).replace(/\s+/g, ' ');
      console.error(`Nominatim non-JSON response (${contentType}) for "${cityName}": ${preview}`);
      throw new Error('Nominatim returned non-JSON response');
    }

    const results = await response.json();
    
    if (!Array.isArray(results) || results.length === 0) {
      console.warn(`Nominatim: No results for "${cityName}"`);
      return null;
    }

    const bestResult = pickBestNominatimResult(results);
    
    if (!bestResult || !bestResult.geojson) {
      console.warn(`Nominatim: No valid GeoJSON for "${cityName}" (${results.length} results)`);
      return null;
    }

    // Parse and return the result
    return parseNominatimResponse(bestResult);
    
  } catch (error) {
    // Log all errors before returning null
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Nominatim exception for "${cityName}": ${errorMsg}`);
    return null;
  }
}

