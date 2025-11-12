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

// Extract state from city input and return bounding box
export function getStateBoundingBox(cityInput: string): [number, number, number, number] | null {
  // Parse "City, State" format
  const parts = cityInput.split(', ');
  if (parts.length !== 2) {
    console.log(`❌ Invalid city format: "${cityInput}". Expected "City, State"`);
    return null;
  }
  
  const cityName = parts[0].trim();
  const stateAbbr = parts[1].trim().toUpperCase();
  
  console.log(`🔍 Parsed city: "${cityName}", state: "${stateAbbr}"`);
  
  // Map abbreviation to full state name
  const stateName = STATE_ABBR_TO_NAME[stateAbbr];
  if (!stateName) {
    console.log(`❌ Unknown state abbreviation: "${stateAbbr}"`);
    return null;
  }
  
  console.log(`🔍 Mapped to state: "${stateName}"`);
  
  // Get bounding box for the state
  const bbox = STATE_BBOXES[stateName];
  if (!bbox) {
    console.log(`❌ No bounding box found for state: "${stateName}"`);
    return null;
  }
  
  console.log(`✅ Found bounding box for ${stateName}: [${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}]`);
  return bbox;
}

// Overpass strategies are now imported where needed

// Working boundary selection function
export function selectBestBoundary(elements: OverpassElement[]): OverpassElement | null {
  console.log(`🔍 Selecting best boundary from ${elements.length} Overpass elements`);
  
  // Priority system for boundary selection
  const priorities = [
    { admin_level: '8', place: 'city' },     // City proper
    { admin_level: '7', place: 'city' },     // Larger city admin
    { admin_level: '8' },                    // Any admin level 8
    { admin_level: '7' },                    // Any admin level 7
    { place: 'city' },                       // Any place=city
    { place: 'town' },                       // Town level
    { boundary: 'administrative' },          // Any administrative boundary
    {}                                       // Accept ANY valid element
  ];

  for (let i = 0; i < priorities.length; i++) {
    const priority = priorities[i];
    console.log(`🔍 Checking priority ${i}:`, priority);
    
    const match = elements.find(el => {
      if (!el.tags) {
        console.log(`🔍 Element ${el.id} skipped: no tags`);
        return false;
      }
      
      // Check if element has valid geometry first
      if (!hasValidGeometry(el)) {
        console.log(`🔍 Element ${el.id} skipped: invalid geometry`);
        return false;
      }
      
      // Check if ANY of the specified criteria match
      const matchesAdmin = !priority.admin_level || el.tags.admin_level === priority.admin_level;
      const matchesPlace = !priority.place || el.tags.place === priority.place;
      const matchesBoundary = !priority.boundary || el.tags.boundary === priority.boundary;
      
      // If no specific criteria, accept any element with valid geometry
      if (Object.keys(priority).length === 0) {
        console.log(`🔍 Element ${el.id} (${el.tags.name}): accepting as fallback (no specific criteria)`);
        return true;
      }
      
      const hasMatch = (priority.admin_level && matchesAdmin) || 
                      (priority.place && matchesPlace) || 
                      (priority.boundary && matchesBoundary);
      
      console.log(`🔍 Element ${el.id} (${el.tags.name}): admin=${el.tags.admin_level}, place=${el.tags.place}, boundary=${el.tags.boundary}, hasMatch=${hasMatch}`);
      
      return hasMatch;
    });
    
    if (match) {
      console.log(`✅ Selected element ${match.id} (${match.tags.name}) with priority ${i}:`, priority);
      return match;
    }
  }
  
  console.log(`🔍 No priority match found, looking for first element with valid geometry...`);
  
  // Fallback to first element with valid geometry
  const fallback = elements.find(el => hasValidGeometry(el));
  if (fallback) {
    console.log(`✅ Selected fallback element ${fallback.id} (${fallback.tags.name})`);
  } else {
    console.log(`❌ No elements with valid geometry found`);
  }
  
  return fallback || null;
}

export function hasValidGeometry(element: OverpassElement): boolean {
  // MORE FLEXIBLE: Accept more types of valid elements
  const isValid = element.type === 'relation' && 
         !!element.tags &&
         !!element.tags.name;
         
  // Check if it has members (for relations) but don't require them to be non-empty
  // Some valid city boundaries might have empty member lists initially
  const hasMembers = !!element.members;
  
  if (!isValid) {
    console.log(`🔍 Element ${element.id} invalid geometry check:`, {
      type: element.type,
      hasTags: !!element.tags,
      hasName: !!element.tags?.name
    });
  } else if (!hasMembers) {
    console.log(`🔍 Element ${element.id} has no members but might still be valid:`, element.tags);
  }
  
  return isValid;
}

// Convert OSM relation to GeoJSON
export function osmRelationToGeoJSON(relation: OverpassElement): Feature<Polygon | MultiPolygon> {
  console.log(`🔍 Converting OSM relation ${relation.id} (${relation.tags?.name}) to GeoJSON`);
  console.log(`🔍 Relation type: ${relation.type}, members count: ${relation.members?.length || 0}`);
  const coordinates: number[][][] = [];
  if (relation.members) {
    console.log(`🔍 Processing ${relation.members.length} relation members...`);
    for (let i = 0; i < relation.members.length; i++) {
      const member = relation.members[i];
      console.log(`🔍 Member ${i}: type=${member.type}, ref=${member.ref}, role=${member.role}`);
      console.log(`🔍 Member ${i} has geometry: ${!!member.geometry}, geometry length: ${member.geometry?.length || 0}`);
      // Only include members with valid geometry (non-empty arrays) and non-inner roles
      if (member.geometry && member.geometry.length > 0 && member.role !== 'inner') {
        // Validate that all coordinates are numbers
        const validGeometry = member.geometry.filter(coord => 
          Array.isArray(coord) && coord.length === 2 && 
          typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
          !isNaN(coord[0]) && !isNaN(coord[1])
        );
        
        if (validGeometry.length > 0) {
          // Ensure the ring is closed (first and last coordinate are the same)
          let closedRing = validGeometry;
          if (validGeometry.length > 2 && 
              (validGeometry[0][0] !== validGeometry[validGeometry.length - 1][0] || 
               validGeometry[0][1] !== validGeometry[validGeometry.length - 1][1])) {
            console.log(`🔍 Member ${i}: Ring not closed, adding closing coordinate`);
            closedRing = [...validGeometry, validGeometry[0]];
          }
          
          console.log(`🔍 Member ${i} valid geometry sample:`, closedRing.slice(0, 3));
          console.log(`🔍 Member ${i} ring length: ${closedRing.length}, closed: ${closedRing[0][0] === closedRing[closedRing.length - 1][0] && closedRing[0][1] === closedRing[closedRing.length - 1][1]}`);
          coordinates.push(closedRing);
        } else {
          console.log(`🔍 Member ${i} skipped: no valid coordinates after filtering`);
        }
      } else {
        console.log(`🔍 Member ${i} skipped: role=${member.role}, hasGeometry=${!!member.geometry}, geometryLength=${member.geometry?.length || 0}`);
      }
    }
  }
  console.log(`🔍 Total valid coordinates arrays collected: ${coordinates.length}`);
  if (coordinates.length > 0) {
    console.log(`🔍 First coordinates array length: ${coordinates[0]?.length || 0}`);
    console.log(`🔍 First coordinates array sample:`, coordinates[0]?.slice(0, 3));
    console.log(`🔍 First coordinates array closed: ${coordinates[0]?.length > 0 ? coordinates[0][0][0] === coordinates[0][coordinates[0].length - 1][0] && coordinates[0][0][1] === coordinates[0][coordinates[0].length - 1][1] : 'N/A'}`);
  }
  
  if (coordinates.length === 0) {
    console.error(`❌ No valid coordinates found for relation ${relation.id}`);
    console.error(`❌ Relation data:`, JSON.stringify(relation, null, 2));
    throw new Error(`No valid coordinates found for relation ${relation.id}`);
  }
  
  if (coordinates.length > 1) {
    console.log(`🔍 Creating MultiPolygon with ${coordinates.length} coordinate arrays`);
    // For MultiPolygon, each coordinate array should be wrapped in its own array
    return { 
      type: 'Feature', 
      geometry: { 
        type: 'MultiPolygon', 
        coordinates: coordinates.map(ring => [ring]) 
      }, 
      properties: { 
        name: relation.tags.name, 
        admin_level: relation.tags.admin_level, 
        place: relation.tags.place, 
        osm_id: relation.id 
      } 
    };
  } else if (coordinates.length === 1) {
    console.log(`🔍 Creating single Polygon with ${coordinates[0]?.length || 0} coordinate pairs`);
    return { 
      type: 'Feature', 
      geometry: { 
        type: 'Polygon', 
        coordinates: coordinates 
      }, 
      properties: { 
        name: relation.tags.name, 
        admin_level: relation.tags.admin_level, 
        place: relation.tags.place, 
        osm_id: relation.id 
      } 
    };
  } else {
    console.error(`❌ Unexpected state: coordinates.length = ${coordinates.length}`);
    throw new Error(`Unexpected state in coordinate processing`);
  }
}

// Calculate bounding box from GeoJSON
export function calculateBBox(geojson: Feature<Polygon | MultiPolygon>): [number, number, number, number] {
  console.log(`🔍 Calculating bounding box for:`, geojson.properties?.name || 'unnamed');
  console.log(`🔍 Geometry type: ${geojson.geometry.type}`);
  console.log(`🔍 Raw coordinates:`, geojson.geometry.coordinates);
  
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  
  function processCoordinates(coords: unknown) {
    if (Array.isArray(coords)) {
      if (Array.isArray(coords[0])) {
        // This is an array of coordinate arrays
        console.log(`🔍 Processing coordinate array with ${coords.length} elements`);
        coords.forEach(processCoordinates);
      } else if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        // This is a coordinate pair [lon, lat]
        const [lon, lat] = coords as number[];
        console.log(`🔍 Processing coordinate pair: [${lon}, ${lat}]`);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      } else {
        console.log(`🔍 Skipping invalid coordinate:`, coords);
      }
    } else {
      console.log(`🔍 Skipping non-array coordinate:`, coords);
    }
  }
  
  if (geojson.geometry && geojson.geometry.coordinates) {
    console.log(`🔍 Starting coordinate processing...`);
    processCoordinates(geojson.geometry.coordinates);
  } else {
    console.log(`🔍 No geometry or coordinates found`);
  }
  
  console.log(`🔍 Bounding box calculation result:`, { minLon, minLat, maxLon, maxLat });
  
  // Validate that we found valid coordinates
  if (!isFinite(minLon) || !isFinite(minLat) || !isFinite(maxLon) || !isFinite(maxLat)) {
    console.warn('⚠️ Invalid bounding box calculated, using fallback values');
    return [-180, -90, 180, 90]; // Fallback to world bounds
  }
  
  console.log(`📍 Calculated bounding box: [${minLon.toFixed(6)}, ${minLat.toFixed(6)}, ${maxLon.toFixed(6)}, ${maxLat.toFixed(6)}]`);
  
  return [minLon, minLat, maxLon, maxLat];
}

// Nominatim fallback helpers
export function validateGeoJSON(geojson: unknown): boolean {
  if (!geojson || typeof geojson !== 'object') return false;
  
  const geoObj = geojson as Record<string, unknown>;
  const validTypes = ['Polygon', 'MultiPolygon'];
  if (!validTypes.includes(geoObj.type as string)) return false;
  
  if (!Array.isArray(geoObj.coordinates)) return false;
  
  return true;
}

export function normalizeBbox(boundingbox: string[]): [number, number, number, number] {
  return [
    parseFloat(boundingbox[0]), // minLat
    parseFloat(boundingbox[2]), // minLon
    parseFloat(boundingbox[1]), // maxLat
    parseFloat(boundingbox[3])  // maxLon
  ];
}

export function pickBestNominatimResult(results: NominatimResult[]): NominatimResult | null {
  if (!results || results.length === 0) return null;
  
  // First, filter results that have geojson polygons
  const withPolygons = results.filter(result => 
    result.geojson && validateGeoJSON(result.geojson)
  );
  
  if (withPolygons.length === 0) return null;
  
  // Prefer boundary administrative results
  const boundaryAdmin = withPolygons.find(result => 
    result.class === 'boundary' && result.type === 'administrative'
  );
  
  if (boundaryAdmin) return boundaryAdmin;
  
  // Otherwise return the first result with a polygon
  return withPolygons[0];
}

// ===== NEW: Enhanced City Response with Buffering & H3 Grid =====

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
}

// Create buffered polygon using Turf.js
export function createBufferedPolygon(
  geojson: Feature<Polygon | MultiPolygon>, 
  bufferKm: number = 1
): Feature<Polygon | MultiPolygon> {
  // Import turf dynamically to avoid SSR issues
  const turf = require('@turf/turf');
  
  try {
    console.log(`🔍 Creating buffered polygon for:`, geojson.properties?.name || 'unnamed');
    console.log(`🔍 GeoJSON type: ${geojson.geometry.type}`);
    console.log(`🔍 Coordinates structure:`, {
      isArray: Array.isArray(geojson.geometry.coordinates),
      length: Array.isArray(geojson.geometry.coordinates) ? geojson.geometry.coordinates.length : 'N/A',
      firstElement: Array.isArray(geojson.geometry.coordinates) && geojson.geometry.coordinates.length > 0 ? 
        (Array.isArray(geojson.geometry.coordinates[0]) ? geojson.geometry.coordinates[0].length : 'N/A') : 'N/A'
    });
    
    // Validate coordinates before buffering
    if (!geojson.geometry.coordinates || 
        !Array.isArray(geojson.geometry.coordinates) || 
        geojson.geometry.coordinates.length === 0) {
      throw new Error('Invalid coordinates structure in GeoJSON');
    }
    
    // Convert to meters (turf.buffer expects meters)
    const bufferMeters = bufferKm * 1000;
    
    console.log(`🔍 Applying ${bufferKm}km buffer (${bufferMeters}m)`);
    
    // Apply buffer to the polygon
    const buffered = turf.buffer(geojson, bufferMeters, { units: 'meters' });
    
    console.log(`🔍 Buffer result:`, {
      type: buffered?.type,
      isFeature: buffered?.type === 'Feature',
      hasGeometry: !!buffered?.geometry
    });
    
    // Ensure we return a valid Feature
    if (buffered && buffered.type === 'Feature') {
      return buffered;
    }
    
    // If buffer returns a geometry, wrap it in a Feature
    if (buffered && (buffered.type === 'Polygon' || buffered.type === 'MultiPolygon')) {
      return {
        type: 'Feature',
        geometry: buffered,
        properties: geojson.properties || {}
      };
    }
    
    throw new Error('Invalid buffer result');
  } catch (error) {
    console.error('Error creating buffered polygon:', error);
    // Fallback to original polygon if buffering fails
    return geojson;
  }
}

// Generate H3 grid from polygon
export function generateH3Grid(
  polygon: Feature<Polygon | MultiPolygon>, 
  resolution: number = 7
): string[] {
  // Import h3 dynamically to avoid SSR issues
  const h3 = require('h3-js');
  
  try {
    console.log(`🌐 Generating H3 grid for polygon with resolution ${resolution}`);
    console.log(`🌐 Polygon name: ${polygon.properties?.name || 'unnamed'}`);
    console.log(`🌐 Geometry type: ${polygon.geometry.type}`);
    
    // Use polygonToCells for accurate hexagon clipping to the polygon boundary
    // This generates hexagons that are exactly contained within the polygon
    let hexagons: string[] = [];
    
    if (polygon.geometry.type === 'Polygon') {
      // For single polygon, convert coordinates to [lat, lng] format that H3 expects
      const polygonGeometry = polygon.geometry as Polygon;
      const coordinates = polygonGeometry.coordinates.map(ring => 
        ring.map(coord => [coord[1], coord[0]]) // Convert [lng, lat] to [lat, lng]
      );
      
      console.log(`🌐 Converting Polygon to H3 grid with ${coordinates[0].length} coordinate pairs`);
      hexagons = h3.polygonToCells(coordinates, resolution);
      
    } else if (polygon.geometry.type === 'MultiPolygon') {
      // For MultiPolygon, process each polygon separately and combine results
      const multiPolygonGeometry = polygon.geometry as MultiPolygon;
      console.log(`🌐 Processing MultiPolygon with ${multiPolygonGeometry.coordinates.length} polygons`);
      
      for (let i = 0; i < multiPolygonGeometry.coordinates.length; i++) {
        const polyCoords = multiPolygonGeometry.coordinates[i].map(ring => 
          ring.map(coord => [coord[1], coord[0]]) // Convert [lng, lat] to [lat, lng]
        );
        
        const polyHexagons = h3.polygonToCells(polyCoords, resolution);
        hexagons = [...hexagons, ...polyHexagons];
        
        console.log(`🌐 Polygon ${i + 1}: generated ${polyHexagons.length} hexagons`);
      }
      
      // Remove duplicates that might occur at polygon boundaries
      hexagons = [...new Set(hexagons)];
      
    } else {
      const geometryType = (polygon.geometry as Polygon | MultiPolygon).type;
      console.error(`❌ Unsupported geometry type: ${geometryType}`);
      return [];
    }
    
    console.log(`✅ Generated ${hexagons.length} H3 hexagons using polygonToCells (exactly clipped to polygon)`);
    
    // Validate that we got a reasonable number of hexagons
    if (hexagons.length === 0) {
      console.warn(`⚠️ No hexagons generated - this might indicate an issue with the polygon`);
      return [];
    }
    
    if (hexagons.length > 10000) {
      console.warn(`⚠️ Generated ${hexagons.length} hexagons - this is a very large grid`);
    }
    
    return hexagons;

  } catch (error) {
    console.error('Error generating H3 grid with polygonToCells:', error);
    
    // Fallback to simple center-based generation if polygonToCells fails
    try {
      console.log(`🔄 polygonToCells failed, falling back to center-based generation...`);
      
      const bbox = calculateBBox(polygon);
      const [minLon, minLat, maxLon, maxLat] = bbox;
      
      // Check if we got world bounds (fallback)
      if (minLon === -180 && minLat === -90 && maxLon === 180 && maxLat === 90) {
        console.error(`❌ Fallback also got world bounds - polygon is completely invalid`);
        return [];
      }
      
      const centerLat = (minLat + maxLat) / 2;
      const centerLon = (minLon + maxLon) / 2;
      
      // Generate a small grid around the center as last resort
      const centerH3 = h3.latLngToCell(centerLat, centerLon, resolution);
      const fallbackHexagons = h3.gridDisk(centerH3, 10); // Small radius for fallback
      
      console.log(`🔄 Fallback generated ${fallbackHexagons.length} hexagons around center`);
      return fallbackHexagons;
      
    } catch (fallbackError) {
      console.error('Fallback generation also failed:', fallbackError);
      return [];
    }
  }
}

// Calculate grid statistics
export function calculateGridStats(
  h3Indices: string[], 
  resolution: number
): GridStats {
  // Import h3 dynamically to avoid SSR issues
  const h3 = require('h3-js');
  
  try {
    const totalHexagons = h3Indices.length;
    
    // Calculate average hexagon size in km² using the correct function
    // h3.hexArea returns area in square meters, convert to km²
    let avgHexagonSizeKm = 0;
    try {
      // Try the correct function name for newer versions
      avgHexagonSizeKm = h3.hexArea(resolution, 'km²');
    } catch {
      try {
        // Fallback for older versions
        avgHexagonSizeKm = h3.hexArea(resolution) / 1000000; // Convert m² to km²
      } catch {
        // Manual calculation as last resort
        // At resolution 7, each hexagon is roughly 4.8km wide
        avgHexagonSizeKm = 4.8;
      }
    }
    
    // Calculate total coverage area
    const coverageAreaKm2 = totalHexagons * avgHexagonSizeKm;
    
    console.log(`📊 Grid stats calculated: ${totalHexagons} hexagons, avg size: ${avgHexagonSizeKm.toFixed(2)} km², total coverage: ${coverageAreaKm2.toFixed(2)} km²`);
    
    return {
      total_hexagons: totalHexagons,
      resolution: resolution,
      avg_hexagon_size_km: avgHexagonSizeKm,
      coverage_area_km2: coverageAreaKm2
    };
  } catch (error) {
    console.error('Error calculating grid stats:', error);
    // Fallback with estimated values
    return {
      total_hexagons: h3Indices.length,
      resolution: resolution,
      avg_hexagon_size_km: 4.8, // Estimated for resolution 7
      coverage_area_km2: h3Indices.length * 4.8
    };
  }
}

// Enhanced function to create complete enhanced city response
export function createEnhancedCityResponse(
  baseResponse: CityResponse
): EnhancedCityResponse {
  console.log(`🏗️ Creating enhanced city response for: ${baseResponse.name}`);
  console.log(`🏗️ Base response source: ${baseResponse.source}`);
  console.log(`🏗️ Base response bbox:`, baseResponse.bbox);
  console.log(`🏗️ Base response geojson type: ${baseResponse.geojson.geometry.type}`);
  
  try {
    // Create buffered polygon
    console.log(`🏗️ Step 1: Creating buffered polygon...`);
    const bufferedPolygon = createBufferedPolygon(baseResponse.geojson, 1);
    console.log(`🏗️ Buffered polygon created successfully`);
    
    // Generate H3 grid from buffered polygon (covering entire buffered area)
    console.log(`🏗️ Step 2: Generating H3 grid...`);
    const h3Grid = generateH3Grid(bufferedPolygon, 7);
    console.log(`🏗️ H3 grid generated with ${h3Grid.length} hexagons`);
    
    // Calculate grid statistics
    console.log(`🏗️ Step 3: Calculating grid statistics...`);
    const gridStats = calculateGridStats(h3Grid, 7);
    console.log(`🏗️ Grid statistics calculated successfully`);
    
    const result = {
      ...baseResponse,
      buffered_polygon: bufferedPolygon,
      h3_grid: h3Grid,
      grid_stats: gridStats
    };
    
    console.log(`🏗️ Enhanced city response created successfully for ${baseResponse.name}`);
    return result;
  } catch (error) {
    console.error('Error creating enhanced city response:', error);
    // Return base response with empty enhanced data if something fails
    const fallback = {
      ...baseResponse,
      buffered_polygon: baseResponse.geojson,
      h3_grid: [],
      grid_stats: {
        total_hexagons: 0,
        resolution: 7,
        avg_hexagon_size_km: 0,
        coverage_area_km2: 0
      }
    };
    console.log(`🏗️ Returning fallback response for ${baseResponse.name}`);
    return fallback;
  }
}
