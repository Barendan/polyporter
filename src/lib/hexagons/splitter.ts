// Hexagon Splitter - handles dense areas with >240 businesses by subdividing hexagons
import * as h3 from 'h3-js';

export interface SplitHexagon {
  h3Id: string;
  parentH3Id: string;
  resolution: number;
  center: { lat: number; lng: number };
  status: 'queued' | 'processing' | 'fetched' | 'dense' | 'failed';
  yelpTotalBusinesses?: number;
  searchPoints?: unknown[];  // Fixed: Use unknown instead of any
}

export interface HexagonSplitResult {
  originalHexagon: string;
  splitHexagons: SplitHexagon[];
  totalSubHexagons: number;
  splitReason: string;
  estimatedCoverage: string;
}

// Detect if a hexagon is dense (has >240 businesses)
export function detectDenseHexagon(total: number): boolean {
  return total > 240;
}

// Split a hexagon into smaller sub-hexagons for better coverage
export function splitHexagon(
  h3Id: string, 
  currentResolution: number = 7, 
  targetResolution: number = 8
): HexagonSplitResult {
  try {
    // Validate resolution increase
    if (targetResolution <= currentResolution) {
      throw new Error(`Target resolution must be higher than current resolution`);
    }
    
    // Generate child hexagons
    const childHexagons = h3.cellToChildren(h3Id, targetResolution);
    
    // Create split hexagon objects
    const splitHexagons: SplitHexagon[] = childHexagons.map((childId: string) => {
      const center = h3.cellToLatLng(childId);
      
      return {
        h3Id: childId,
        parentH3Id: h3Id,
        resolution: targetResolution,
        center: { lat: center[0], lng: center[1] },
        status: 'queued' as const,
        yelpTotalBusinesses: undefined,
        searchPoints: undefined
      };
    });
    
    // Calculate estimated coverage improvement
    const coverageImprovement = calculateCoverageImprovement(currentResolution, targetResolution);
    
    const result: HexagonSplitResult = {
      originalHexagon: h3Id,
      splitHexagons,
      totalSubHexagons: childHexagons.length,
      splitReason: `Dense hexagon with >240 businesses - split for better coverage`,
      estimatedCoverage: coverageImprovement
    };
    
    return result;
    
  } catch (error) {
    console.error('Error splitting hexagon:', error);
    throw new Error(`Failed to split hexagon ${h3Id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Calculate estimated coverage improvement from resolution increase
function calculateCoverageImprovement(currentRes: number, targetRes: number): string {
  // H3 resolution increases by 1 = ~7x more hexagons
  const resolutionDiff = targetRes - currentRes;
  const estimatedHexagons = Math.pow(7, resolutionDiff);
  
  let improvement = 'unknown';
  if (estimatedHexagons >= 49) {
    improvement = 'excellent';
  } else if (estimatedHexagons >= 7) {
    improvement = 'good';
  } else if (estimatedHexagons >= 2) {
    improvement = 'moderate';
  } else {
    improvement = 'minimal';
  }
  
  return `${improvement} (${estimatedHexagons}x more hexagons)`;
}

// Merge results from split hexagons back to parent
export function mergeSubHexagonResults(
  originalH3Id: string, 
  splitResults: Array<{ h3Id: string; businesses: Array<{ id: string }>; total: number }>
): {
  totalBusinesses: number;
  uniqueBusinesses: Array<{ id: string }>;
  coverageStatus: string;
  subHexagonStatus: string[];
} {
  try {
    // Collect all businesses and remove duplicates
    const allBusinesses: Array<{ id: string }> = [];
    const businessIds = new Set<string>();
    
    let totalBusinesses = 0;
    const subHexagonStatus: string[] = [];
    
    for (const result of splitResults) {
      totalBusinesses += result.total;
      
      // Track sub-hexagon status
      const status = result.total > 240 ? 'dense' : 'fetched';
      subHexagonStatus.push(`${result.h3Id}: ${status} (${result.total} businesses)`);
      
      // Add unique businesses
      for (const business of result.businesses) {
        if (!businessIds.has(business.id)) {
          businessIds.add(business.id);
          allBusinesses.push(business);
        }
      }
    }
    
    // Determine overall coverage status
    let coverageStatus = 'complete';
    if (splitResults.some(r => r.total > 240)) {
      coverageStatus = 'partial-dense';
    }
    if (splitResults.some(r => r.total === 0)) {
      coverageStatus = 'partial-empty';
    }
    
    return {
      totalBusinesses,
      uniqueBusinesses: allBusinesses,
      coverageStatus,
      subHexagonStatus
    };
    
  } catch (error) {
    console.error('Error merging sub-hexagon results:', error);
    throw new Error(`Failed to merge sub-hexagon results: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get split statistics for monitoring
export function getSplitStats(splitResult: HexagonSplitResult): {
  originalHexagon: string;
  subHexagonCount: number;
  resolutionIncrease: number;
  estimatedCoverage: string;
  splitReason: string;
} {
  return {
    originalHexagon: splitResult.originalHexagon,
    subHexagonCount: splitResult.totalSubHexagons,
    resolutionIncrease: 1, // Always increases by 1 for now
    estimatedCoverage: splitResult.estimatedCoverage,
    splitReason: splitResult.splitReason
  };
}

// Validate split hexagon configuration
export function validateSplitConfiguration(
  currentResolution: number, 
  targetResolution: number
): boolean {
  // Check if resolution increase is reasonable
  if (targetResolution <= currentResolution) {
    console.error(`❌ Invalid resolution: target (${targetResolution}) must be > current (${currentResolution})`);
    return false;
  }
  
  // Check if resolution increase is too large (could create too many hexagons)
  if (targetResolution - currentResolution > 2) {
    return false;
  }
  
  // Check if target resolution is within reasonable bounds
  if (targetResolution > 12) {
    console.error(`❌ Target resolution too high: ${targetResolution} (max recommended: 12)`);
    return false;
  }
  
  return true;
}
