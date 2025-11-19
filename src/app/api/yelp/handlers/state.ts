// Shared processing state management for Yelp API handlers

export interface ProcessingState {
  totalHexagons: number;
  processedHexagons: number;
  phase1Total: number;
  phase1Processed: number;
  phase2Total: number;
  phase2Processed: number;
  isProcessing: boolean;
  startTime?: number;
  importLogId?: string | null; // Store import log ID for failure handling
  actualApiCalls: number; // Track actual API calls made
  estimatedTotalApiCalls: number; // Estimated total API calls (hexagons × 3)
  lastRestaurantCount: number; // Restaurants from last processed hexagon
}

// Global processing states map - keyed by processId
export const processingStates = new Map<string, ProcessingState>();

