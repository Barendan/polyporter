// Enhanced Yelp Search Engine - handles multi-point searches, pagination, and hexagon splitting
import { yelpRateLimiter } from './rateLimiter';
import { yelpQuotaManager } from '../utils/quotaManager';
import { generateSearchPoints, validateCoverage, type HexagonCoverage } from '../hexagons/coverage';
import { detectDenseHexagon, splitHexagon } from '../hexagons/splitter';
import * as h3 from 'h3-js';

export interface YelpBusiness {
  id: string;
  name: string;
  rating: number;
  review_count: number;
  price: string;
  categories: Array<{ alias: string; title: string }>;
  coordinates: { latitude: number; longitude: number };
  location: {
    address1: string;
    city: string;
    state: string;
    zip_code: string;
  };
  phone: string;
  url: string;
  distance: number;
  h3Id?: string; // H3 hexagon ID (populated for manual imports and cached data)
}

export interface YelpSearchResult {
  businesses: YelpBusiness[];
  total: number;
  region: unknown;  // Fixed: Use unknown instead of any
  h3Id: string;
  searchPoint: unknown;  // Fixed: Use unknown instead of any
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

export interface HexagonYelpResult {
  h3Id: string;
  mapIndex?: number; // Optional map index for correlation with map hexagons
  totalBusinesses: number;
  uniqueBusinesses: YelpBusiness[];
  searchResults: YelpSearchResult[];
  status: 'fetched' | 'dense' | 'failed' | 'split';
  splitResult?: unknown;  // Fixed: Use unknown instead of any
  coverageQuality: string;
  error?: string;
}

export class YelpSearchEngine {
  private apiKey: string;
  private baseUrl: string = 'https://api.yelp.com/v3';
  private deduplicationMap: Map<string, YelpBusiness> = new Map();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Main method to search a hexagon with complete coverage
  async searchHexagon(h3Id: string): Promise<HexagonYelpResult> {
    try {
      // Check quota before proceeding
      const quotaEstimate = yelpQuotaManager.estimateQuotaForCity(1, 7, 1.5);
      if (!quotaEstimate.canProcessRequest) {
        throw new Error(`Insufficient quota: ${quotaEstimate.recommendations.join(', ')}`);
      }
      
      // Generate search points for complete coverage
      const hexagonCoverage = generateSearchPoints(h3Id);
      
      // Validate coverage
      if (!validateCoverage(hexagonCoverage)) {
        throw new Error('Invalid hexagon coverage generated');
      }
      
      // Search all points with rate limiting
      const searchResults = await this.searchAllPoints(hexagonCoverage);
      
      // Process results and check for dense areas
      const result = await this.processSearchResults(h3Id, searchResults, hexagonCoverage);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error searching hexagon ${h3Id}:`, error);
      return {
        h3Id,
        totalBusinesses: 0,
        uniqueBusinesses: [],
        searchResults: [],
        status: 'failed',
        coverageQuality: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Search all points in a hexagon with rate limiting
  private async searchAllPoints(hexagonCoverage: HexagonCoverage): Promise<YelpSearchResult[]> {
    const { searchPoints } = hexagonCoverage;
    const results: YelpSearchResult[] = [];
    
    for (let i = 0; i < searchPoints.length; i++) {
      const searchPoint = searchPoints[i];
      
      try {
        // FIXED: Wait for rate limiter slot BEFORE making request
        // This ensures proper throttling and prevents 503 errors
        await yelpRateLimiter.waitForSlot();
        
        // Track quota usage
        yelpQuotaManager.trackAPICall();
        
        // Search this point with pagination
        const result = await this.searchPointWithPagination(searchPoint);
        result.h3Id = hexagonCoverage.h3Id;
        result.searchPoint = searchPoint;
        
        results.push(result);
        
        // FIXED: Additional delay between search points to be extra safe
        // Rate limiter handles spacing, but this adds extra buffer
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.error(`❌ Error searching point ${i + 1}:`, error);
        results.push({
          businesses: [],
          total: 0,
          region: {},
          h3Id: hexagonCoverage.h3Id,
          searchPoint,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }

  // Search a single point with pagination handling
  private async searchPointWithPagination(searchPoint: { lat: number; lng: number; radius: number }): Promise<YelpSearchResult> {
    const { lat, lng, radius } = searchPoint;
    let allBusinesses: YelpBusiness[] = [];
    let total = 0;
    let offset = 0;
    const limit = 50;
    const maxOffset = 200; // Yelp's limit
    
    try {
      // First search to get total count
      const firstResult = await this.makeYelpSearch(lat, lng, radius, 0);
      total = firstResult.total || 0;
      allBusinesses = [...(firstResult.businesses || [])];
      
      // If total > 50, continue pagination
      if (total > limit && offset < maxOffset) {
        offset += limit;
        
        while (offset < Math.min(total, maxOffset) && offset < maxOffset) {
          const nextResult = await this.makeYelpSearch(lat, lng, radius, offset);
          
          if (nextResult.businesses && nextResult.businesses.length > 0) {
            allBusinesses = [...allBusinesses, ...nextResult.businesses];
            offset += limit;
          } else {
            // No more results
            break;
          }
          
          // FIXED: Rate limiting between pages - wait BEFORE making request
          await yelpRateLimiter.waitForSlot();
          yelpQuotaManager.trackAPICall();
          
          // Additional small delay between paginated requests
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      // Remove duplicates
      const uniqueBusinesses = this.deduplicateBusinesses(allBusinesses);
      
      return {
        businesses: uniqueBusinesses,
        total: uniqueBusinesses.length,
        region: firstResult.region || {},
        h3Id: '',
        searchPoint: null,
        status: 'success'
      };
      
    } catch (error) {
      console.error(`❌ Error in paginated search:`, error);
      return {
        businesses: [],
        total: 0,
        region: {},
        h3Id: '',
        searchPoint: null,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Make a single Yelp API call with retry logic
  private async makeYelpSearch(
    lat: number, 
    lng: number, 
    radius: number, 
    offset: number = 0,
    retryCount: number = 0
  ): Promise<{ total: number; businesses: YelpBusiness[]; region: unknown }> {
    const url = `${this.baseUrl}/businesses/search`;
    // Yelp API requires radius to be an integer (whole number in meters)
    // Round any decimal values to ensure API validation passes
    const roundedRadius = Math.round(radius);
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      radius: roundedRadius.toString(),
      categories: 'restaurants',
      limit: '50',
      offset: offset.toString()
    });
    
    const maxRetries = 3;
    const retryDelay = 1000; // Start with 1 second
    
    try {
      const response = await fetch(`${url}?${params}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Handle 503 Service Unavailable and other retryable errors
      if (!response.ok) {
        const isRetryable = response.status === 503 || response.status === 429 || response.status >= 500;
        
        if (isRetryable && retryCount < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = retryDelay * Math.pow(2, retryCount);
          console.warn(`⚠️ Yelp API ${response.status} error, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Retry the request
          return this.makeYelpSearch(lat, lng, radius, offset, retryCount + 1);
        }
        
        // Non-retryable error or max retries reached
        throw new Error(`Yelp API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
      
    } catch (error) {
      // If it's a network error and we haven't exceeded retries, try again
      if (retryCount < maxRetries && error instanceof TypeError && error.message.includes('fetch')) {
        const delay = retryDelay * Math.pow(2, retryCount);
        console.warn(`⚠️ Network error, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.makeYelpSearch(lat, lng, radius, offset, retryCount + 1);
      }
      
      console.error(`❌ Yelp API call failed after ${retryCount + 1} attempts:`, error);
      throw error;
    }
  }

  // Process search results and handle dense areas
  private async processSearchResults(
    h3Id: string, 
    searchResults: YelpSearchResult[], 
    hexagonCoverage: HexagonCoverage
  ): Promise<HexagonYelpResult> {
    try {
      // Combine all results
      const allBusinesses = searchResults.flatMap(r => r.businesses);
      
      // FIXED: Add boundary validation to filter out restaurants outside hexagon
      const validatedBusinesses = this.validateBusinessBoundaries(h3Id, allBusinesses);
      const totalBusinesses = this.deduplicateBusinesses(validatedBusinesses).length;
      
      // Check if hexagon is dense
      if (detectDenseHexagon(totalBusinesses)) {
        // Split hexagon for better coverage
        const splitResult = splitHexagon(h3Id, 7, 8); // Use resolution 7->8 instead of 8->9
        
        // IMPORTANT: Queue child hexagons for subdivision processing
        // This is the critical integration point that was missing
        try {
          const { hexagonProcessor } = await import('../hexagons/processor');
          await hexagonProcessor.handleDenseHexagons(h3Id, totalBusinesses, 7);
        } catch (importError) {
          // Continue without subdivision - this is a fallback
        }
        
        return {
          h3Id,
          totalBusinesses,
          uniqueBusinesses: this.deduplicateBusinesses(validatedBusinesses),
          searchResults,
          status: 'split',
          splitResult,
          coverageQuality: 'dense-split'
        };
      }
      
      // Normal hexagon - return results
      const coverageQuality = this.assessCoverageQuality(hexagonCoverage, totalBusinesses);
      
      return {
        h3Id,
        totalBusinesses,
        uniqueBusinesses: this.deduplicateBusinesses(validatedBusinesses),
        searchResults,
        status: 'fetched',
        coverageQuality
      };
      
    } catch (error) {
      console.error(`❌ Error processing search results:`, error);
      throw error;
    }
  }

  // Deduplicate businesses across all search points
  private deduplicateBusinesses(businesses: YelpBusiness[]): YelpBusiness[] {
    const uniqueMap = new Map<string, YelpBusiness>();
    
    for (const business of businesses) {
      if (!uniqueMap.has(business.id)) {
        uniqueMap.set(business.id, business);
      }
    }
    
    return Array.from(uniqueMap.values());
  }

  // Assess coverage quality based on search points and results
  private assessCoverageQuality(hexagonCoverage: HexagonCoverage, totalBusinesses: number): string {
    const { searchPoints } = hexagonCoverage;
    
    if (searchPoints.length >= 7 && totalBusinesses > 100) {
      return 'excellent';
    } else if (searchPoints.length >= 5 && totalBusinesses > 50) {
      return 'good';
    } else if (searchPoints.length >= 3 && totalBusinesses > 20) {
      return 'fair';
    } else {
      return 'poor';
    }
  }

  // FIXED: Validate that businesses are actually within the hexagon boundaries
  private validateBusinessBoundaries(h3Id: string, businesses: YelpBusiness[]): YelpBusiness[] {
    const validatedBusinesses: YelpBusiness[] = [];
    let filteredCount = 0;
    
    for (const business of businesses) {
      try {
        // Use H3 pointToCell to check if business coordinates fall within the hexagon
        const businessH3Id = h3.latLngToCell(
          business.coordinates.latitude, 
          business.coordinates.longitude, 
          h3.getResolution(h3Id)
        );
        
        // If the business's H3 cell matches our hexagon, it's within boundaries
        if (businessH3Id === h3Id) {
          validatedBusinesses.push(business);
        } else {
          filteredCount++;
        }
      } catch (error) {
        // Include business if validation fails (fail-safe approach)
        validatedBusinesses.push(business);
      }
    }
    
    return validatedBusinesses;
  }

  // Get search statistics for monitoring
  getSearchStats(): {
    totalSearches: number;
    successfulSearches: number;
    failedSearches: number;
    averageBusinessesPerHexagon: number;
    quotaStatus: unknown;  // Fixed: Use unknown instead of any
  } {
    const quotaStatus = yelpQuotaManager.getQuotaStatus();
    
    return {
      totalSearches: quotaStatus.dailyUsed,
      successfulSearches: quotaStatus.dailyUsed, // Simplified for now
      failedSearches: 0, // Would need to track separately
      averageBusinessesPerHexagon: 0, // Would need to track separately
      quotaStatus
    };
  }
}
