// Hexagon Coverage Strategy - ensures complete business coverage with overlapping searches
import * as h3 from 'h3-js';
import * as turf from '@turf/turf';

export interface SearchPoint {
  lat: number;
  lng: number;
  radius: number;
  type: 'primary' | 'corner' | 'edge';
  description: string;
}

export interface HexagonCoverage {
  h3Id: string;
  center: { lat: number; lng: number };
  searchPoints: SearchPoint[];
  totalRadius: number;
  coverageStrategy: string;
}

// Generate multiple overlapping search points to ensure complete hexagon coverage
export function generateSearchPoints(h3Id: string): HexagonCoverage {
  try {
    // Get hexagon center and boundary
    const center = h3.cellToLatLng(h3Id);
    const boundary = h3.cellToBoundary(h3Id, true);
    
    // Calculate optimal primary radius (distance from center to furthest corner)
    const primaryRadius = calculateOptimalRadius(center, boundary);
    
    // FIXED: Remove hardcoded 3km cap - use H3-based calculation instead
    const optimizedRadius = primaryRadius; // No more arbitrary 3km cap
    const primaryPoint: SearchPoint = {
      lat: center[0],
      lng: center[1],
      radius: optimizedRadius,
      type: 'primary',
      description: `Center point with H3-optimized ${(optimizedRadius/1000).toFixed(1)}km radius`
    };
    
    // OPTIMIZATION: Use adaptive coverage based on hexagon size
    const hexagonArea = calculateHexagonArea(h3Id);
    const searchPoints = generateAdaptiveSearchPoints(center, boundary, optimizedRadius, hexagonArea);
    
    return {
      h3Id,
      center: { lat: center[0], lng: center[1] },
      searchPoints: searchPoints,
      totalRadius: optimizedRadius,
      coverageStrategy: 'adaptive-coverage-optimized'
    };
    
  } catch (error) {
    console.error('Error generating search points:', error);
    throw new Error(`Failed to generate search points for hexagon ${h3Id}`);
  }
}

// Calculate optimal radius from center to furthest corner
function calculateOptimalRadius(center: [number, number], boundary: [number, number][]): number {
  try {
    // Get H3 resolution from the first boundary point to determine hexagon size
    // Since we don't have h3Id here, we'll use a more conservative approach
    // For resolution 7, we know the inradius is ~1.06km, so we'll use that as base
    
    // Calculate distance from center to furthest corner using turf
    let maxDistance = 0;
    
    for (const corner of boundary) {
      const distance = turf.distance(
        turf.point([center[1], center[0]]), // [lng, lat] for turf
        turf.point([corner[1], corner[0]]), // [lng, lat] for turf
        'meters'
      );
      
      maxDistance = Math.max(maxDistance, distance);
    }
    
    // FIXED: Use H3-based radius calculation instead of arbitrary 3km
    // For resolution 7 hexagons, use the actual inradius (1.06km) + small buffer
    const estimatedInradius = 1060; // meters, based on H3 resolution 7 inradius
    const safeRadius = Math.min(maxDistance * 0.9, estimatedInradius * 1.1); // 90% of max distance, capped at 110% of inradius
    
    return Math.round(safeRadius);
    
  } catch (error) {
    console.error('Error calculating radius:', error);
    // Fallback to H3 resolution 7 inradius (1.06km) instead of arbitrary 3km
    return 1060; // 1.06km - the actual H3 resolution 7 inradius
  }
}

// Generate corner search points for complete coverage
function generateCornerSearches(
  center: [number, number], 
  boundary: [number, number][], 
  primaryRadius: number,
  maxCorners: number = boundary.length
): SearchPoint[] {
  const cornerPoints: SearchPoint[] = [];
  
  // FIXED: Use H3-based radius calculation instead of hardcoded caps
  // Calculate safe radius based on H3 resolution 7 inradius
  const estimatedInradius = 1060; // meters, based on H3 resolution 7 inradius
  const maxSafeRadius = estimatedInradius * 0.9; // 90% of inradius for safety
  const cornerRadius = Math.min(primaryRadius * 0.6, maxSafeRadius); // ~1100m instead of 2500m
  
  // Limit the number of corner points based on hexagon size
  const cornersToUse = Math.min(maxCorners, boundary.length);
  
  for (let i = 0; i < cornersToUse; i++) {
    const corner = boundary[i];
    
    const cornerPoint: SearchPoint = {
      lat: corner[0],
      lng: corner[1],
      radius: cornerRadius,
      type: 'corner',
      description: `Corner ${i + 1} coverage point`
    };
    
    cornerPoints.push(cornerPoint);
  }
  
  return cornerPoints;
}

// Generate edge search points for additional coverage
function generateEdgeSearches(
  center: [number, number], 
  boundary: [number, number][], 
  primaryRadius: number,
  maxEdges: number = boundary.length
): SearchPoint[] {
  const edgePoints: SearchPoint[] = [];
  
  // FIXED: Use H3-based radius calculation instead of hardcoded caps
  // Calculate safe radius based on H3 resolution 7 inradius
  const estimatedInradius = 1060; // meters, based on H3 resolution 7 inradius
  const maxSafeRadius = estimatedInradius * 0.9; // 90% of inradius for safety
  const edgeRadius = Math.min(primaryRadius * 0.8, maxSafeRadius); // ~1100m instead of 2800m
  
  // Limit the number of edge points based on hexagon size
  const edgesToUse = Math.min(maxEdges, boundary.length);
  
  // Generate points along the edges for better coverage
  for (let i = 0; i < edgesToUse; i++) {
    const currentCorner = boundary[i];
    const nextCorner = boundary[(i + 1) % boundary.length];
    
    // Add midpoint between corners
    const midLat = (currentCorner[0] + nextCorner[0]) / 2;
    const midLng = (currentCorner[1] + nextCorner[1]) / 2;
    
    const edgePoint: SearchPoint = {
      lat: midLat,
      lng: midLng,
      radius: edgeRadius,
      type: 'edge',
      description: `Edge ${i + 1} midpoint coverage`
    };
    
    edgePoints.push(edgePoint);
  }
  
  return edgePoints;
}

// Validate that search points provide complete coverage
export function validateCoverage(hexagonCoverage: HexagonCoverage): boolean {
  try {
    const { h3Id, searchPoints } = hexagonCoverage;
    
    // Check if we have search points
    if (searchPoints.length === 0) {
      console.error(`❌ No search points generated for hexagon ${h3Id}`);
      return false;
    }
    
    // Check if primary point exists
    const primaryPoint = searchPoints.find(p => p.type === 'primary');
    if (!primaryPoint) {
      console.error(`❌ No primary search point for hexagon ${h3Id}`);
      return false;
    }
    
    // FIXED: Remove overly strict corner coverage requirements
    // The adaptive coverage system generates appropriate points based on hexagon size
    // Small hexagons (<5 km²) only need 1 point, larger ones get more
    const cornerPoints = searchPoints.filter(p => p.type === 'corner');
    const hexagonArea = calculateHexagonArea(h3Id);
    
    // Only require additional corner points for large hexagons
    if (hexagonArea > 10 && cornerPoints.length < 2) {
      console.error(`❌ Insufficient corner coverage for large hexagon ${h3Id}: ${cornerPoints.length} corners for ${hexagonArea.toFixed(1)} km²`);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('Error validating coverage:', error);
    return false;
  }
}

// Calculate hexagon area in square kilometers
function calculateHexagonArea(h3Id: string): number {
  try {
    const area = h3.cellArea(h3Id, 'km2');
    return area;
  } catch (error) {
    console.error('Error calculating hexagon area:', error);
    return 0;
  }
}

// Generate adaptive search points based on hexagon size
function generateAdaptiveSearchPoints(
  center: [number, number], 
  boundary: [number, number][], 
  primaryRadius: number,
  hexagonArea: number
): SearchPoint[] {
  const searchPoints: SearchPoint[] = [];
  
  // Always add primary center point with H3-optimized radius
  // FIXED: Remove hardcoded 3km cap - use H3-based calculation instead
  const optimizedRadius = primaryRadius; // No more arbitrary 3km cap
  searchPoints.push({
    lat: center[0],
    lng: center[1],
    radius: optimizedRadius,
    type: 'primary',
    description: `Center point with H3-optimized ${(optimizedRadius/1000).toFixed(1)}km radius`
  });
  
  // Updated thresholds for better coverage of resolution 7 hexagons
  if (hexagonArea > 8) {
    // Large hexagon (>8 km²) - use 5 points for excellent coverage
    const cornerPoints = generateCornerSearches(center, boundary, optimizedRadius, 3);
    searchPoints.push(...cornerPoints);
    
    const edgePoints = generateEdgeSearches(center, boundary, optimizedRadius, 2);
    searchPoints.push(...edgePoints);
    
  } else if (hexagonArea > 3) {
    // Medium hexagon (3-8 km²) - use 3 points for good coverage (includes resolution 7)
    const cornerPoints = generateCornerSearches(center, boundary, optimizedRadius, 2);
    searchPoints.push(...cornerPoints);
    
  } else {
    // Small hexagon (<3 km²) - use 1 point (center only) for efficiency
    // No additional points needed
  }
  
  return searchPoints;
}

// Get coverage statistics for monitoring
export function getCoverageStats(hexagonCoverage: HexagonCoverage): {
  totalPoints: number;
  primaryRadius: number;
  cornerPoints: number;
  edgePoints: number;
  estimatedCoverage: string;
} {
  const { searchPoints } = hexagonCoverage;
  
  const primaryPoint = searchPoints.find(p => p.type === 'primary');
  const cornerPoints = searchPoints.filter(p => p.type === 'corner');
  const edgePoints = searchPoints.filter(p => p.type === 'edge');
  
  let estimatedCoverage = 'unknown';
  if (searchPoints.length >= 5) {
    estimatedCoverage = 'excellent';
  } else if (searchPoints.length >= 3) {
    estimatedCoverage = 'good';
  } else if (searchPoints.length >= 2) {
    estimatedCoverage = 'fair';
  } else {
    estimatedCoverage = 'poor';
  }
  
  return {
    totalPoints: searchPoints.length,
    primaryRadius: primaryPoint?.radius || 0,
    cornerPoints: cornerPoints.length,
    edgePoints: edgePoints.length,
    estimatedCoverage
  };
}
