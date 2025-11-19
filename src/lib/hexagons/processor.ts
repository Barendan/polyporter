// Enhanced Hexagon Processor - handles coverage strategies and dense hexagon processing
import { generateSearchPoints, validateCoverage, getCoverageStats, type HexagonCoverage } from './coverage';
import { detectDenseHexagon, splitHexagon, mergeSubHexagonResults, type SplitHexagon, type HexagonSplitResult } from './splitter';
import { yelpQuotaManager } from '../utils/quotaManager';

export interface HexagonProcessingStatus {
  h3Id: string;
  resolution: number;           // NEW: Track current resolution
  parentH3Id?: string;          // NEW: Link to parent if split
  childH3Ids?: string[];        // NEW: Link to children if parent
  status: 'queued' | 'processing' | 'fetched' | 'dense' | 'failed' | 'split';
  coverageQuality: string;
  searchPointsCount: number;
  totalBusinesses?: number;
  error?: string;
  splitResult?: HexagonSplitResult;  // Fixed: Use proper type instead of any
  processingTime?: number;
  needsSubdivision: boolean;    // NEW: Flag for subdivision
  subdivisionResult?: HexagonSplitResult;
}

export interface ProcessingBatch {
  hexagons: string[];
  estimatedQuota: number;
  canProcess: boolean;
  riskLevel: string;
  recommendations: string[];
}

export class HexagonProcessor {
  private processingQueue: Map<string, HexagonProcessingStatus> = new Map();
  private completedHexagons: Map<string, HexagonProcessingStatus> = new Map();
  private failedHexagons: Map<string, HexagonProcessingStatus> = new Map();
  
  // NEW: Subdivision queue management for Phase 2
  private subdivisionQueue: Map<string, HexagonProcessingStatus> = new Map();
  private parentChildRelationships: Map<string, string[]> = new Map(); // parent -> children
  private childParentRelationships: Map<string, string> = new Map(); // child -> parent

  constructor() {
  }

  // Process a single hexagon with complete coverage strategy
  async processHexagonWithCoverage(h3Id: string, resolution: number = 7, yelpResult?: { totalBusinesses: number; status: string; coverageQuality: string }): Promise<HexagonProcessingStatus> {
    const startTime = Date.now();
    
    try {
      // Update status to processing
      this.updateProcessingStatus(h3Id, 'processing', resolution);
      
      // Generate search points for complete coverage
      const hexagonCoverage = generateSearchPoints(h3Id);
      
      // Validate coverage
      if (!validateCoverage(hexagonCoverage)) {
        throw new Error('Invalid hexagon coverage generated');
      }
      
      // Get coverage statistics
      const coverageStats = getCoverageStats(hexagonCoverage);
      
      // Use Yelp results if provided, otherwise use coverage stats
      const totalBusinesses = yelpResult?.totalBusinesses || 0;
      const coverageQuality = yelpResult?.coverageQuality || coverageStats.estimatedCoverage;
      const needsSubdivision = totalBusinesses > 240;
      
      const status: HexagonProcessingStatus = {
        h3Id,
        resolution,
        status: yelpResult?.status === 'split' ? 'split' : 'fetched',
        coverageQuality,
        searchPointsCount: coverageStats.totalPoints,
        totalBusinesses,
        processingTime: Date.now() - startTime,
        needsSubdivision,
        parentH3Id: undefined,
        childH3Ids: undefined,
        subdivisionResult: undefined
      };
      
      // Update status
      this.updateProcessingStatus(h3Id, status.status, resolution);
      this.completedHexagons.set(h3Id, status);
      
      return status;
      
    } catch (error) {
      console.error(`❌ Error processing hexagon ${h3Id}:`, error);
      
      const failedStatus: HexagonProcessingStatus = {
        h3Id,
        resolution,
        status: 'failed',
        coverageQuality: 'unknown',
        searchPointsCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime,
        needsSubdivision: false,
        parentH3Id: undefined,
        childH3Ids: undefined,
        subdivisionResult: undefined
      };
      
      this.updateProcessingStatus(h3Id, 'failed', resolution);
      this.failedHexagons.set(h3Id, failedStatus);
      
      return failedStatus;
      
    }
  }

  // Handle dense hexagons by splitting them
  async handleDenseHexagons(h3Id: string, totalBusinesses: number, currentResolution: number = 7): Promise<HexagonProcessingStatus> {
    try {
      if (!detectDenseHexagon(totalBusinesses)) {
        throw new Error(`Hexagon ${h3Id} is not dense (${totalBusinesses} businesses)`);
      }
      
      // Split hexagon for better coverage (from current resolution to next level)
      const targetResolution = currentResolution + 1;
      const splitResult = splitHexagon(h3Id, currentResolution, targetResolution);
      
      const status: HexagonProcessingStatus = {
        h3Id,
        resolution: currentResolution,
        status: 'split',
        coverageQuality: 'dense-split',
        searchPointsCount: 0, // Will be calculated for sub-hexagons
        totalBusinesses,
        splitResult,
        processingTime: 0,
        needsSubdivision: true,
        parentH3Id: undefined,
        childH3Ids: splitResult.splitHexagons.map(h => h.h3Id),
        subdivisionResult: splitResult
      };
      
      // Update status
      this.updateProcessingStatus(h3Id, 'split', currentResolution);
      this.completedHexagons.set(h3Id, status);
      
      // NEW: Queue child hexagons for processing and maintain relationships
      const childH3Ids = splitResult.splitHexagons.map(h => h.h3Id);
      this.parentChildRelationships.set(h3Id, childH3Ids);
      
      // Queue each child hexagon for subdivision processing
      for (const childHexagon of splitResult.splitHexagons) {
        const childStatus: HexagonProcessingStatus = {
          h3Id: childHexagon.h3Id,
          resolution: targetResolution,
          status: 'queued',
          coverageQuality: 'pending',
          searchPointsCount: 0,
          parentH3Id: h3Id,
          needsSubdivision: false,
          childH3Ids: undefined,
          subdivisionResult: undefined,
          processingTime: 0
        };
        
        // Add to subdivision queue and maintain parent-child relationships
        this.subdivisionQueue.set(childHexagon.h3Id, childStatus);
        this.childParentRelationships.set(childHexagon.h3Id, h3Id);
      }
      
      return status;
      
    } catch (error) {
      console.error(`❌ Error handling dense hexagon ${h3Id}:`, error);
      
      const failedStatus: HexagonProcessingStatus = {
        h3Id,
        resolution: currentResolution,
        status: 'failed',
        coverageQuality: 'unknown',
        searchPointsCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0,
        needsSubdivision: false,
        parentH3Id: undefined,
        childH3Ids: undefined,
        subdivisionResult: undefined
      };
      
      this.updateProcessingStatus(h3Id, 'failed', currentResolution);
      this.failedHexagons.set(h3Id, failedStatus);
      
      return failedStatus;
    }
  }

  // NEW: Process subdivision queue with quota management (Task 2.2 + 3.2)
  async processSubdivisionQueue(): Promise<HexagonProcessingStatus[]> {
    try {
      const subdivisionHexagons = Array.from(this.subdivisionQueue.values())
        .filter(h => h.status === 'queued');
      
      if (subdivisionHexagons.length === 0) {
        return [];
      }
      
      // NEW: Check subdivision quota before processing
      const subdivisionQuota = this.checkSubdivisionQuota(subdivisionHexagons.length);
      if (!subdivisionQuota.canProcess) {
        return [];
      }
      
      const results: HexagonProcessingStatus[] = [];
      
      // Process each subdivision hexagon with quota tracking
      for (const subdivisionHex of subdivisionHexagons) {
        try {
          // Check individual hexagon quota
          const hexagonQuota = this.checkHexagonQuota(subdivisionHex.h3Id, subdivisionHex.resolution);
          if (!hexagonQuota.canProcess) {
            continue;
          }
          
          // Process the child hexagon with the higher resolution
          const result = await this.processHexagonWithCoverage(subdivisionHex.h3Id, subdivisionHex.resolution);
          
          // Update the subdivision queue status
          result.parentH3Id = subdivisionHex.parentH3Id;
          this.subdivisionQueue.set(subdivisionHex.h3Id, result);
          
          // Move to completed hexagons
          this.completedHexagons.set(subdivisionHex.h3Id, result);
          this.subdivisionQueue.delete(subdivisionHex.h3Id);
          
          // Track subdivision quota usage
          this.trackSubdivisionQuotaUsage(subdivisionHex.h3Id, subdivisionHex.resolution);
          
          results.push(result);
          
        } catch (error) {
          console.error(`❌ Error processing subdivision hexagon ${subdivisionHex.h3Id}:`, error);
          
          const failedStatus: HexagonProcessingStatus = {
            h3Id: subdivisionHex.h3Id,
            resolution: subdivisionHex.resolution,
            status: 'failed',
            coverageQuality: 'unknown',
            searchPointsCount: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
            processingTime: 0,
            needsSubdivision: false,
            parentH3Id: subdivisionHex.parentH3Id,
            childH3Ids: undefined,
            subdivisionResult: undefined
          };
          
          this.failedHexagons.set(subdivisionHex.h3Id, failedStatus);
          this.subdivisionQueue.delete(subdivisionHex.h3Id);
          results.push(failedStatus);
        }
      }
      
      return results;
      
    } catch (error) {
      console.error(`❌ Error processing subdivision queue:`, error);
      throw error;
    }
  }

  // NEW: Complete two-phase processing algorithm (Task 3.1)
  async processTwoPhaseAlgorithm(hexagons: string[]): Promise<{
    phase1Results: HexagonProcessingStatus[];
    phase2Results: HexagonProcessingStatus[];
    finalStats: {
      totalProcessed: number;
      totalSplit: number;
      totalBusinesses: number;
      coverageQuality: string;
    };
  }> {
    try {
      // PHASE 1: Process all hexagons at resolution 7
      const phase1Results: HexagonProcessingStatus[] = [];
      
      for (const h3Id of hexagons) {
        try {
          const result = await this.processHexagonWithCoverage(h3Id, 7);
          phase1Results.push(result);
          
          // Check if this hexagon needs subdivision
          if (result.needsSubdivision && result.totalBusinesses && result.totalBusinesses > 240) {
            await this.handleDenseHexagons(h3Id, result.totalBusinesses, 7);
          }
          
        } catch (error) {
          console.error(`❌ Phase 1: Error processing hexagon ${h3Id}:`, error);
          const failedResult: HexagonProcessingStatus = {
            h3Id,
            resolution: 7,
            status: 'failed',
            coverageQuality: 'unknown',
            searchPointsCount: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
            processingTime: 0,
            needsSubdivision: false,
            parentH3Id: undefined,
            childH3Ids: undefined,
            subdivisionResult: undefined
          };
          phase1Results.push(failedResult);
        }
      }
      
      // PHASE 2: Process subdivision queue (resolution 8 hexagons)
      const phase2Results = await this.processSubdivisionQueue();
      
      // Calculate final statistics
      const allResults = [...phase1Results, ...phase2Results];
      const totalProcessed = allResults.filter(r => r.status === 'fetched' || r.status === 'split').length;
      const totalSplit = allResults.filter(r => r.status === 'split').length;
      const totalBusinesses = allResults.reduce((sum, r) => sum + (r.totalBusinesses || 0), 0);
      
      // Determine overall coverage quality
      let coverageQuality = 'unknown';
      const successfulResults = allResults.filter(r => r.status === 'fetched' || r.status === 'split');
      if (successfulResults.length === allResults.length) {
        coverageQuality = 'excellent';
      } else if (successfulResults.length > allResults.length * 0.8) {
        coverageQuality = 'good';
      } else if (successfulResults.length > allResults.length * 0.6) {
        coverageQuality = 'fair';
      } else {
        coverageQuality = 'poor';
      }
      
      const finalStats = {
        totalProcessed,
        totalSplit,
        totalBusinesses,
        coverageQuality
      };
      
      return {
        phase1Results,
        phase2Results,
        finalStats
      };
      
    } catch (error) {
      console.error(`❌ Error in two-phase processing algorithm:`, error);
      throw error;
    }
  }

  // NEW: Unified processing pipeline for both R7 and R8 (Task 3.3)
  async processUnifiedPipeline(hexagons: string[]): Promise<{
    results: HexagonProcessingStatus[];
    summary: {
      totalHexagons: number;
      resolution7Count: number;
      resolution8Count: number;
      totalBusinesses: number;
      coverageQuality: string;
      processingTime: number;
      quotaUsed: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      // Use the two-phase algorithm as the core
      const twoPhaseResult = await this.processTwoPhaseAlgorithm(hexagons);
      
      // Combine all results
      const allResults = [...twoPhaseResult.phase1Results, ...twoPhaseResult.phase2Results];
      
      // Get quota usage information
      const quotaStatus = yelpQuotaManager.getQuotaStatus();
      const quotaUsed = quotaStatus.dailyUsed;
      
      // Calculate summary statistics
      const resolution7Count = allResults.filter(r => r.resolution === 7).length;
      const resolution8Count = allResults.filter(r => r.resolution === 8).length;
      const totalBusinesses = allResults.reduce((sum, r) => sum + (r.totalBusinesses || 0), 0);
      
      const summary = {
        totalHexagons: allResults.length,
        resolution7Count,
        resolution8Count,
        totalBusinesses,
        coverageQuality: twoPhaseResult.finalStats.coverageQuality,
        processingTime: Date.now() - startTime,
        quotaUsed
      };
      
      return {
        results: allResults,
        summary
      };
      
    } catch (error) {
      console.error(`❌ Error in unified processing pipeline:`, error);
      throw error;
    }
  }

  // Process a batch of hexagons with quota checking
  async processBatch(hexagons: string[], resolution: number = 7): Promise<ProcessingBatch> {
    try {
      // Estimate quota needed
      const estimatedQuota = yelpQuotaManager.estimateQuotaForCity(hexagons.length, resolution, 1.5);
      
      const batch: ProcessingBatch = {
        hexagons,
        estimatedQuota: estimatedQuota.estimatedCalls,
        canProcess: estimatedQuota.canProcessRequest,
        riskLevel: estimatedQuota.riskLevel,
        recommendations: estimatedQuota.recommendations
      };
      
      if (!batch.canProcess) {
        return batch;
      }
      
      // Process hexagons in parallel (with rate limiting handled by Yelp engine)
      const processingPromises = hexagons.map(h3Id => this.processHexagonWithCoverage(h3Id, resolution));
      const results = await Promise.all(processingPromises);
      
      return batch;
      
    } catch (error) {
      console.error(`❌ Error processing batch:`, error);
      throw error;
    }
  }

  // Track processing status
  private updateProcessingStatus(h3Id: string, status: HexagonProcessingStatus['status'], resolution: number = 7): void {
    const currentStatus = this.processingQueue.get(h3Id) || {
      h3Id,
      resolution,
      status: 'queued',
      coverageQuality: 'unknown',
      searchPointsCount: 0,
      needsSubdivision: false,
      parentH3Id: undefined,
      childH3Ids: undefined,
      subdivisionResult: undefined
    };
    
    currentStatus.status = status;
    currentStatus.resolution = resolution;
    this.processingQueue.set(h3Id, currentStatus);
  }

  // Get processing statistics
  getProcessingStats(): {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    split: number;
    total: number;
    resolution7: number;
    resolution8: number;
    subdivisionQueue: number;
    parentChildRelationships: number;
  } {
    const queued = Array.from(this.processingQueue.values()).filter(h => h.status === 'queued').length;
    const processing = Array.from(this.processingQueue.values()).filter(h => h.status === 'processing').length;
    const completed = this.completedHexagons.size;
    const failed = this.failedHexagons.size;
    const split = Array.from(this.completedHexagons.values()).filter(h => h.status === 'split').length;
    const resolution7 = Array.from(this.completedHexagons.values()).filter(h => h.resolution === 7).length;
    const resolution8 = Array.from(this.completedHexagons.values()).filter(h => h.resolution === 8).length;
    const subdivisionQueue = this.subdivisionQueue.size;
    const parentChildRelationships = this.parentChildRelationships.size;
    
    return {
      queued,
      processing,
      completed,
      failed,
      split,
      total: queued + processing + completed + failed,
      resolution7,
      resolution8,
      subdivisionQueue,
      parentChildRelationships
    };
  }

  // Get detailed status for a specific hexagon
  getHexagonStatus(h3Id: string): HexagonProcessingStatus | null {
    return this.processingQueue.get(h3Id) || 
           this.completedHexagons.get(h3Id) || 
           this.failedHexagons.get(h3Id) || 
           this.subdivisionQueue.get(h3Id) ||
           null;
  }

  // Get all hexagons with a specific status
  getHexagonsByStatus(status: HexagonProcessingStatus['status']): HexagonProcessingStatus[] {
    const allHexagons = [
      ...Array.from(this.processingQueue.values()),
      ...Array.from(this.completedHexagons.values()),
      ...Array.from(this.failedHexagons.values())
    ];
    
    return allHexagons.filter(h => h.status === status);
  }

  // Get all hexagons with a specific resolution
  getHexagonsByResolution(resolution: number): HexagonProcessingStatus[] {
    const allHexagons = [
      ...Array.from(this.processingQueue.values()),
      ...Array.from(this.completedHexagons.values()),
      ...Array.from(this.failedHexagons.values()),
      ...Array.from(this.subdivisionQueue.values())
    ];
    
    return allHexagons.filter(h => h.resolution === resolution);
  }

  // NEW: Parent-child relationship management (Task 2.3)
  getChildHexagons(parentH3Id: string): HexagonProcessingStatus[] {
    const childIds = this.parentChildRelationships.get(parentH3Id) || [];
    return childIds.map(childId => this.getHexagonStatus(childId)).filter(h => h !== null) as HexagonProcessingStatus[];
  }

  getParentHexagon(childH3Id: string): HexagonProcessingStatus | null {
    const parentId = this.childParentRelationships.get(childH3Id);
    if (!parentId) return null;
    return this.getHexagonStatus(parentId);
  }

  // Check if all children of a parent are processed
  areAllChildrenProcessed(parentH3Id: string): boolean {
    const childIds = this.parentChildRelationships.get(parentH3Id) || [];
    if (childIds.length === 0) return true;
    
    return childIds.every(childId => {
      const childStatus = this.getHexagonStatus(childId);
      return childStatus && (childStatus.status === 'fetched' || childStatus.status === 'split' || childStatus.status === 'failed');
    });
  }

  // Get aggregated results from all children of a parent
  getAggregatedChildResults(parentH3Id: string): {
    totalBusinesses: number;
    completedChildren: number;
    failedChildren: number;
    splitChildren: number;
    coverageQuality: string;
  } {
    const childStatuses = this.getChildHexagons(parentH3Id);
    
    const totalBusinesses = childStatuses.reduce((sum, child) => sum + (child.totalBusinesses || 0), 0);
    const completedChildren = childStatuses.filter(child => child.status === 'fetched').length;
    const failedChildren = childStatuses.filter(child => child.status === 'failed').length;
    const splitChildren = childStatuses.filter(child => child.status === 'split').length;
    
    // Determine overall coverage quality
    let coverageQuality = 'unknown';
    if (failedChildren === 0) {
      if (completedChildren === childStatuses.length) {
        coverageQuality = 'excellent';
      } else if (completedChildren > childStatuses.length * 0.8) {
        coverageQuality = 'good';
      } else {
        coverageQuality = 'fair';
      }
    } else {
      coverageQuality = 'poor';
    }
    
    return {
      totalBusinesses,
      completedChildren,
      failedChildren,
      splitChildren,
      coverageQuality
    };
  }

  // NEW: Resolution-aware result storage and merging (Task 2.4)
  getResultsByResolution(): {
    resolution7: HexagonProcessingStatus[];
    resolution8: HexagonProcessingStatus[];
    mixed: HexagonProcessingStatus[];
  } {
    const allCompleted = Array.from(this.completedHexagons.values());
    
    const resolution7 = allCompleted.filter(h => h.resolution === 7);
    const resolution8 = allCompleted.filter(h => h.resolution === 8);
    const mixed = allCompleted.filter(h => h.resolution !== 7 && h.resolution !== 8);
    
    return { resolution7, resolution8, mixed };
  }

  // Merge parent and child results for complete coverage view
  getMergedResults(): Array<{
    h3Id: string;
    resolution: number;
    status: string;
    totalBusinesses: number;
    coverageQuality: string;
    isParent: boolean;
    hasChildren: boolean;
    childrenSummary?: {
      totalChildren: number;
      completedChildren: number;
      totalChildBusinesses: number;
    };
  }> {
    const mergedResults: Array<{
      h3Id: string;
      resolution: number;
      status: string;
      totalBusinesses: number;
      coverageQuality: string;
      isParent: boolean;
      hasChildren: boolean;
      childrenSummary?: {
        totalChildren: number;
        completedChildren: number;
        totalChildBusinesses: number;
      };
    }> = [];

    const allCompleted = Array.from(this.completedHexagons.values());
    
    for (const hexagon of allCompleted) {
      const hasChildren = this.parentChildRelationships.has(hexagon.h3Id);
      const isParent = hasChildren;
      
      let totalBusinesses = hexagon.totalBusinesses || 0;
      let coverageQuality = hexagon.coverageQuality;
      
      // If this hexagon has children, aggregate their results
      let childrenSummary;
      if (hasChildren) {
        const aggregatedResults = this.getAggregatedChildResults(hexagon.h3Id);
        childrenSummary = {
          totalChildren: this.parentChildRelationships.get(hexagon.h3Id)?.length || 0,
          completedChildren: aggregatedResults.completedChildren,
          totalChildBusinesses: aggregatedResults.totalBusinesses
        };
        
        // Use child results if they're complete
        if (this.areAllChildrenProcessed(hexagon.h3Id)) {
          totalBusinesses = aggregatedResults.totalBusinesses;
          coverageQuality = aggregatedResults.coverageQuality;
        }
      }
      
      mergedResults.push({
        h3Id: hexagon.h3Id,
        resolution: hexagon.resolution,
        status: hexagon.status,
        totalBusinesses,
        coverageQuality,
        isParent,
        hasChildren,
        childrenSummary
      });
    }
    
    return mergedResults;
  }

  // NEW: Subdivision quota management methods (Task 3.2)
  private checkSubdivisionQuota(hexagonCount: number): {
    canProcess: boolean;
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    
    // Check if we have enough quota for subdivision processing
    const estimatedQuota = yelpQuotaManager.estimateQuotaForCity(hexagonCount, 8, 2.0); // Higher multiplier for R8
    
    if (!estimatedQuota.canProcessRequest) {
      recommendations.push(`Insufficient quota for ${hexagonCount} subdivision hexagons`);
      recommendations.push(`Estimated needed: ${estimatedQuota.estimatedCalls} calls`);
      recommendations.push(`Available: ${yelpQuotaManager.getQuotaStatus().dailyRemaining} calls remaining`);
    }
    
    // Check if subdivision queue is getting too large
    if (hexagonCount > 100) {
      recommendations.push(`Subdivision queue too large (${hexagonCount} hexagons) - consider processing in smaller batches`);
    }
    
    const canProcess = estimatedQuota.canProcessRequest && hexagonCount <= 100;
    
    return {
      canProcess,
      recommendations
    };
  }

  private checkHexagonQuota(h3Id: string, resolution: number): {
    canProcess: boolean;
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    
    // Check individual hexagon quota
    const estimatedQuota = yelpQuotaManager.estimateQuotaForCity(1, resolution, 1.5);
    
    if (!estimatedQuota.canProcessRequest) {
      recommendations.push(`Insufficient quota for hexagon ${h3Id} at resolution ${resolution}`);
      recommendations.push(`Risk level: ${estimatedQuota.riskLevel}`);
    }
    
    // Check if this hexagon has already been processed
    const existingStatus = this.getHexagonStatus(h3Id);
    if (existingStatus && existingStatus.status === 'fetched') {
      recommendations.push(`Hexagon ${h3Id} already processed - skipping`);
    }
    
    const canProcess = estimatedQuota.canProcessRequest && 
                      (!existingStatus || existingStatus.status !== 'fetched');
    
    return {
      canProcess,
      recommendations
    };
  }

  private trackSubdivisionQuotaUsage(h3Id: string, resolution: number): void {
    // Track quota usage for subdivision processing
    yelpQuotaManager.trackAPICall();
  }

  // Get subdivision queue status
  getSubdivisionQueueStatus(): {
    queuedCount: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
    totalRelationships: number;
  } {
    const subdivisionHexagons = Array.from(this.subdivisionQueue.values());
    
    return {
      queuedCount: subdivisionHexagons.filter(h => h.status === 'queued').length,
      processingCount: subdivisionHexagons.filter(h => h.status === 'processing').length,
      completedCount: subdivisionHexagons.filter(h => h.status === 'fetched' || h.status === 'split').length,
      failedCount: subdivisionHexagons.filter(h => h.status === 'failed').length,
      totalRelationships: this.parentChildRelationships.size
    };
  }

  // NEW: Comprehensive error handling and retry logic (Task 3.4)
  async processWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          console.error(`❌ Operation failed after ${maxRetries} attempts:`, lastError.message);
          throw lastError;
        }
        
        // Calculate delay with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  // Retry processing for failed hexagons
  async retryFailedHexagons(maxRetries: number = 2): Promise<{
    retriedCount: number;
    successCount: number;
    stillFailedCount: number;
  }> {
    const failedHexagons = Array.from(this.failedHexagons.values());
    
    if (failedHexagons.length === 0) {
      return { retriedCount: 0, successCount: 0, stillFailedCount: 0 };
    }
    
    let successCount = 0;
    let stillFailedCount = 0;
    
    for (const failedHex of failedHexagons) {
      try {
        // Remove from failed list
        this.failedHexagons.delete(failedHex.h3Id);
        
        // Retry with exponential backoff
        const result = await this.processWithRetry(
          () => this.processHexagonWithCoverage(failedHex.h3Id, failedHex.resolution),
          maxRetries,
          2000
        );
        
        // Add back to appropriate collection
        if (result.status === 'fetched' || result.status === 'split') {
          this.completedHexagons.set(failedHex.h3Id, result);
          successCount++;
        } else {
          this.failedHexagons.set(failedHex.h3Id, result);
          stillFailedCount++;
        }
        
      } catch (error) {
        console.error(`❌ Retry failed for hexagon ${failedHex.h3Id}:`, error);
        stillFailedCount++;
        this.failedHexagons.set(failedHex.h3Id, failedHex);
      }
    }
    
    return {
      retriedCount: failedHexagons.length,
      successCount,
      stillFailedCount
    };
  }

  // Get comprehensive error summary
  getErrorSummary(): {
    totalErrors: number;
    errorTypes: Record<string, number>;
    failedHexagons: Array<{
      h3Id: string;
      resolution: number;
      error: string;
      status: string;
    }>;
    recommendations: string[];
  } {
    const failedHexagons = Array.from(this.failedHexagons.values());
    const errorTypes: Record<string, number> = {};
    
    // Count error types
    for (const failed of failedHexagons) {
      const errorType = failed.error || 'unknown';
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    }
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (failedHexagons.length > 0) {
      recommendations.push(`${failedHexagons.length} hexagons failed - consider retrying`);
    }
    
    if (errorTypes['Insufficient quota'] > 0) {
      recommendations.push('Quota exceeded - wait for daily reset or optimize search strategy');
    }
    
    if (errorTypes['Rate limit exceeded'] > 0) {
      recommendations.push('Rate limit hit - implement better rate limiting or reduce concurrency');
    }
    
    if (failedHexagons.length > 10) {
      recommendations.push('High failure rate - check API connectivity and error patterns');
    }
    
    return {
      totalErrors: failedHexagons.length,
      errorTypes,
      failedHexagons: failedHexagons.map(f => ({
        h3Id: f.h3Id,
        resolution: f.resolution,
        error: f.error || 'unknown',
        status: f.status
      })),
      recommendations
    };
  }

  // Clear processing history (for testing)
  clearHistory(): void {
    this.processingQueue.clear();
    this.completedHexagons.clear();
    this.failedHexagons.clear();
    this.subdivisionQueue.clear();
    this.parentChildRelationships.clear();
    this.childParentRelationships.clear();
  }

  // Get coverage optimization recommendations
  getCoverageOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const stats = this.getProcessingStats();
    
    if (stats.failed > stats.completed * 0.1) {
      recommendations.push('High failure rate detected - check API connectivity and rate limits');
    }
    
    if (stats.split > 0) {
      recommendations.push(`${stats.split} hexagons were split due to high density - consider adjusting resolution`);
    }
    
    if (stats.processing > 10) {
      recommendations.push('Large number of hexagons processing - consider batch size optimization');
    }
    
    if (stats.resolution8 > 0) {
      recommendations.push(`${stats.resolution8} hexagons processed at resolution 8 - dense area subdivision working`);
    }
    
    return recommendations;
  }

  // NEW: Detect and handle subdivision needs after Yelp processing
  async detectAndHandleSubdivision(h3Id: string, totalBusinesses: number, currentResolution: number = 7): Promise<HexagonProcessingStatus> {
    try {
      // Check if hexagon needs subdivision (>240 businesses)
      const needsSubdivision = totalBusinesses > 240;
      
      if (needsSubdivision) {
        // Handle dense hexagon by splitting it
        return await this.handleDenseHexagons(h3Id, totalBusinesses, currentResolution);
      } else {
        // Update existing status to mark as not needing subdivision
        const existingStatus = this.getHexagonStatus(h3Id);
        if (existingStatus) {
          existingStatus.needsSubdivision = false;
          existingStatus.totalBusinesses = totalBusinesses;
          existingStatus.status = 'fetched';
          
          // Update in completed hexagons
          this.completedHexagons.set(h3Id, existingStatus);
          
          return existingStatus;
        }
        
        // If no existing status, create a new one
        const status: HexagonProcessingStatus = {
          h3Id,
          resolution: currentResolution,
          status: 'fetched',
          coverageQuality: 'complete',
          searchPointsCount: 0,
          totalBusinesses,
          processingTime: 0,
          needsSubdivision: false,
          parentH3Id: undefined,
          childH3Ids: undefined,
          subdivisionResult: undefined
        };
        
        this.completedHexagons.set(h3Id, status);
        return status;
      }
      
    } catch (error) {
      console.error(`❌ Error detecting subdivision needs for hexagon ${h3Id}:`, error);
      
      const failedStatus: HexagonProcessingStatus = {
        h3Id,
        resolution: currentResolution,
        status: 'failed',
        coverageQuality: 'unknown',
        searchPointsCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0,
        needsSubdivision: false,
        parentH3Id: undefined,
        childH3Ids: undefined,
        subdivisionResult: undefined
      };
      
      this.failedHexagons.set(h3Id, failedStatus);
      return failedStatus;
    }
  }


}

// Global hexagon processor instance
export const hexagonProcessor = new HexagonProcessor();