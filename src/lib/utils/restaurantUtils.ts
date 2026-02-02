// Restaurant utility functions extracted from RestaurantReviewPanel
// These are pure utility functions that don't depend on React state

/**
 * Convert meters to miles with one decimal place
 * @param meters - Distance in meters
 * @returns Distance in miles as a formatted string (e.g., "1.5")
 */
export function metersToMiles(meters: number): string {
  const miles = meters / 1609.34;
  return miles.toFixed(1);
}

/**
 * Franchise detection using strict regex patterns with word boundaries
 * Detects major restaurant chains to minimize false positives
 * 
 * @param restaurantName - The restaurant name to check
 * @returns true if the restaurant matches a known franchise pattern
 */
export function detectFranchise(restaurantName: string): boolean {
  if (!restaurantName) return false;
  
  // Normalize: lowercase, remove apostrophes and special quotes
  const normalized = restaurantName.toLowerCase().replace(/['']/g, '');
  
  // Franchise patterns with word boundaries - covers major chains
  // Each pattern uses \b for word boundaries to avoid false matches
  const franchisePatterns = [
    // Fast Food - Burgers
    /\b(mcdonald'?s?|burger\s+king|wendy'?s?|five\s+guys|in-n-out|shake\s+shack|smashburger|white\s+castle)\b/,
    
    // Fast Food - Sandwiches & Subs
    /\b(subway|jimmy\s+john'?s?|jersey\s+mike'?s?|firehouse\s+subs?|quiznos|potbelly)\b/,
    
    // Fast Food - Chicken
    /\b(chick-fil-a|chickfila|kfc|kentucky\s+fried|popeye'?s?|raising\s+cane'?s?|wingstop|buffalo\s+wild\s+wings?)\b/,
    
    // Fast Food - Mexican
    /\b(taco\s+bell|chipotle|qdoba|del\s+taco|taco\s+cabana|moe'?s?\s+southwest)\b/,
    
    // Fast Food - Pizza
    /\b(pizza\s+hut|domino'?s?|papa\s+john'?s?|little\s+caesars?|marco'?s?\s+pizza|papa\s+murphy'?s?)\b/,
    
    // Fast Food - Other
    /\b(panda\s+express|arby'?s?|sonic\s+drive-in|sonic|dairy\s+queen|culver'?s?|portillo'?s?)\b/,
    
    // Coffee & Breakfast
    /\b(starbucks|dunkin'?(\s+donuts)?|tim\s+hortons?|panera\s+bread|ihop|denny'?s?|waffle\s+house|cracker\s+barrel)\b/,
    
    // Casual Dining
    /\b(applebee'?s?|chili'?s?|olive\s+garden|red\s+lobster|outback\s+steakhouse|texas\s+roadhouse|longhorn\s+steakhouse)\b/,
    
    // Fast Casual & Modern Chains
    /\b(cava|sweetgreen|blaze\s+pizza|mod\s+pizza|&pizza|pieology)\b/,
  ];
  
  // Test against all patterns
  return franchisePatterns.some(pattern => pattern.test(normalized));
}

// Hexagon status types
export type HexagonStatus = 'fetched' | 'failed' | 'dense' | 'split' | 'cached';

/**
 * Get CSS classes for hexagon status styling
 * @param status - The hexagon status
 * @returns Tailwind CSS classes for text and background colors
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'fetched': return 'text-green-600 bg-green-100';
    case 'failed': return 'text-red-600 bg-red-100';
    case 'dense': return 'text-yellow-600 bg-yellow-100';
    case 'split': return 'text-blue-600 bg-blue-100';
    case 'cached': return 'text-purple-600 bg-purple-100';
    default: return 'text-gray-600 bg-gray-100';
  }
}

/**
 * Get emoji icon for hexagon status
 * @param status - The hexagon status
 * @returns Emoji representing the status
 */
export function getStatusIcon(status: string): string {
  switch (status) {
    case 'fetched': return '✅';
    case 'failed': return '❌';
    case 'dense': return '🔀';
    case 'split': return '📊';
    case 'cached': return '💾';
    default: return '❓';
  }
}
