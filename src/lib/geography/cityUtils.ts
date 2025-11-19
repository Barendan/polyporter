import type { Polygon, MultiPolygon, Feature } from 'geojson';
import type { OverpassElement, NominatimResult, CityResponse, GridStats, EnhancedCityResponse } from './cityTypes';
import { STATE_BBOXES, STATE_ABBR_TO_NAME } from './cityTypes';

// Extract state from city input and return bounding box
export function getStateBoundingBox(cityInput: string): [number, number, number, number] | null {
  // Parse "City, State" format
  const parts = cityInput.split(', ');
  if (parts.length !== 2) {
    return null;
  }
  
  const cityName = parts[0].trim();
  const stateAbbr = parts[1].trim().toUpperCase();
  
  // Map abbreviation to full state name
  const stateName = STATE_ABBR_TO_NAME[stateAbbr];
  if (!stateName) {
    return null;
  }
  
  // Get bounding box for the state
  const bbox = STATE_BBOXES[stateName];
  if (!bbox) {
    return null;
  }
  
  return bbox;
}

// Working boundary selection function
export function selectBestBoundary(elements: OverpassElement[]): OverpassElement | null {
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
    
    const match = elements.find(el => {
      if (!el.tags) {
        return false;
      }
      
      // Check if element has valid geometry first
      if (!hasValidGeometry(el)) {
        return false;
      }
      
      // Check if ANY of the specified criteria match
      const matchesAdmin = !priority.admin_level || el.tags.admin_level === priority.admin_level;
      const matchesPlace = !priority.place || el.tags.place === priority.place;
      const matchesBoundary = !priority.boundary || el.tags.boundary === priority.boundary;
      
      // If no specific criteria, accept any element with valid geometry
      if (Object.keys(priority).length === 0) {
        return true;
      }
      
      const hasMatch = (priority.admin_level && matchesAdmin) || 
                      (priority.place && matchesPlace) || 
                      (priority.boundary && matchesBoundary);
      
      return hasMatch;
    });
    
    if (match) {
      return match;
    }
  }
  
  // Fallback to first element with valid geometry
  const fallback = elements.find(el => hasValidGeometry(el));
  
  return fallback || null;
}

export function hasValidGeometry(element: OverpassElement): boolean {
  // MORE FLEXIBLE: Accept more types of valid elements
  const isValid = element.type === 'relation' && 
         !!element.tags &&
         !!element.tags.name;
         
  return isValid;
}

// Convert OSM relation to GeoJSON
export function osmRelationToGeoJSON(relation: OverpassElement): Feature<Polygon | MultiPolygon> {
  const coordinates: number[][][] = [];
  if (relation.members) {
    for (let i = 0; i < relation.members.length; i++) {
      const member = relation.members[i];
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
            closedRing = [...validGeometry, validGeometry[0]];
          }
          coordinates.push(closedRing);
        }
      }
    }
  }
  
  if (coordinates.length === 0) {
    throw new Error(`No valid coordinates found for relation ${relation.id}`);
  }
  
  if (coordinates.length > 1) {
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
    throw new Error(`Unexpected state in coordinate processing`);
  }
}

// Calculate bounding box from GeoJSON
export function calculateBBox(geojson: Feature<Polygon | MultiPolygon>): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  
  function processCoordinates(coords: unknown) {
    if (Array.isArray(coords)) {
      if (Array.isArray(coords[0])) {
        // This is an array of coordinate arrays
        coords.forEach(processCoordinates);
      } else if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        // This is a coordinate pair [lon, lat]
        const [lon, lat] = coords as number[];
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }
  
  if (geojson.geometry && geojson.geometry.coordinates) {
    processCoordinates(geojson.geometry.coordinates);
  }
  
  // Validate that we found valid coordinates
  if (!isFinite(minLon) || !isFinite(minLat) || !isFinite(maxLon) || !isFinite(maxLat)) {
    return [-180, -90, 180, 90]; // Fallback to world bounds
  }
  
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

// Create buffered polygon using Turf.js
export function createBufferedPolygon(
  geojson: Feature<Polygon | MultiPolygon>, 
  bufferKm: number = 1
): Feature<Polygon | MultiPolygon> {
  // Import turf dynamically to avoid SSR issues
  const turf = require('@turf/turf');
  
  try {
    // Validate coordinates before buffering
    if (!geojson.geometry.coordinates || 
        !Array.isArray(geojson.geometry.coordinates) || 
        geojson.geometry.coordinates.length === 0) {
      throw new Error('Invalid coordinates structure in GeoJSON');
    }
    
    // Convert to meters (turf.buffer expects meters)
    const bufferMeters = bufferKm * 1000;
    
    // Apply buffer to the polygon
    const buffered = turf.buffer(geojson, bufferMeters, { units: 'meters' });
    
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
    // Use polygonToCells for accurate hexagon clipping to the polygon boundary
    // This generates hexagons that are exactly contained within the polygon
    let hexagons: string[] = [];
    
    if (polygon.geometry.type === 'Polygon') {
      // For single polygon, convert coordinates to [lat, lng] format that H3 expects
      const polygonGeometry = polygon.geometry as Polygon;
      const coordinates = polygonGeometry.coordinates.map(ring => 
        ring.map(coord => [coord[1], coord[0]]) // Convert [lng, lat] to [lat, lng]
      );
      
      hexagons = h3.polygonToCells(coordinates, resolution);
      
    } else if (polygon.geometry.type === 'MultiPolygon') {
      // For MultiPolygon, process each polygon separately and combine results
      const multiPolygonGeometry = polygon.geometry as MultiPolygon;
      
      for (let i = 0; i < multiPolygonGeometry.coordinates.length; i++) {
        const polyCoords = multiPolygonGeometry.coordinates[i].map(ring => 
          ring.map(coord => [coord[1], coord[0]]) // Convert [lng, lat] to [lat, lng]
        );
        
        const polyHexagons = h3.polygonToCells(polyCoords, resolution);
        hexagons = [...hexagons, ...polyHexagons];
      }
      
      // Remove duplicates that might occur at polygon boundaries
      hexagons = [...new Set(hexagons)];
      
    } else {
      return [];
    }
    
    // Validate that we got a reasonable number of hexagons
    if (hexagons.length === 0) {
      return [];
    }
    
    return hexagons;

  } catch (error) {
    // Fallback to simple center-based generation if polygonToCells fails
    try {
      const bbox = calculateBBox(polygon);
      const [minLon, minLat, maxLon, maxLat] = bbox;
      
      // Check if we got world bounds (fallback)
      if (minLon === -180 && minLat === -90 && maxLon === 180 && maxLat === 90) {
        return [];
      }
      
      const centerLat = (minLat + maxLat) / 2;
      const centerLon = (minLon + maxLon) / 2;
      
      // Generate a small grid around the center as last resort
      const centerH3 = h3.latLngToCell(centerLat, centerLon, resolution);
      const fallbackHexagons = h3.gridDisk(centerH3, 10); // Small radius for fallback
      
      return fallbackHexagons;
      
    } catch (fallbackError) {
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
    
    
    return {
      total_hexagons: totalHexagons,
      resolution: resolution,
      avg_hexagon_size_km: avgHexagonSizeKm,
      coverage_area_km2: coverageAreaKm2
    };
  } catch (error) {
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
  try {
    // Create buffered polygon
    const bufferedPolygon = createBufferedPolygon(baseResponse.geojson, 1);
    
    // Generate H3 grid from buffered polygon (covering entire buffered area)
    const h3Grid = generateH3Grid(bufferedPolygon, 7);
    
    // Calculate grid statistics
    const gridStats = calculateGridStats(h3Grid, 7);
    
    const result = {
      ...baseResponse,
      buffered_polygon: bufferedPolygon,
      h3_grid: h3Grid,
      grid_stats: gridStats
    };
    
    return result;
  } catch (error) {
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
    return fallback;
  }
}

// Re-export types for convenience
export type { OverpassElement, OverpassResponse, NominatimResult, CityResponse, EnhancedCityResponse, GridStats } from './cityTypes';

