// API Quota Manager - tracks daily usage and estimates quota needs for Yelp API calls
export interface QuotaEstimate {
  estimatedCalls: number;
  currentDailyUsage: number;
  remainingQuota: number;
  canProcessRequest: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface QuotaOptimization {
  maxHexagonsPerDay: number;
  recommendedBatchSize: number;
  estimatedProcessingTime: number;
  costEfficiency: number;
}

export class APIQuotaManager {
  private dailyUsage: number = 0;
  private lastReset: number = Date.now();
  private dailyLimit: number = 5000;
  private perSecondLimit: number = 50;
  private currentSecondUsage: number = 0;
  private lastSecondReset: number = Date.now();

  constructor(dailyLimit: number = 5000, perSecondLimit: number = 50) {
    this.dailyLimit = dailyLimit;
    this.perSecondLimit = perSecondLimit;
    
    // Reset daily counter every 24 hours
    setInterval(() => this.resetDailyCounter(), 24 * 60 * 60 * 1000);
    
    // Reset per-second counter every second
    setInterval(() => this.resetPerSecondCounter(), 1000);
  }

  private resetDailyCounter(): void {
    this.dailyUsage = 0;
    this.lastReset = Date.now();
  }

  private resetPerSecondCounter(): void {
    this.currentSecondUsage = 0;
    this.lastSecondReset = Date.now();
  }

  // Track API call usage
  trackAPICall(): void {
    this.dailyUsage++;
    this.currentSecondUsage++;
  }

  // Get current quota status
  getQuotaStatus(): {
    dailyUsed: number;
    dailyRemaining: number;
    dailyUsagePercentage: number;
    perSecondUsed: number;
    perSecondRemaining: number;
    lastReset: Date;
  } {
    return {
      dailyUsed: this.dailyUsage,
      dailyRemaining: this.dailyLimit - this.dailyUsage,
      dailyUsagePercentage: (this.dailyUsage / this.dailyLimit) * 100,
      perSecondUsed: this.currentSecondUsage,
      perSecondRemaining: this.perSecondLimit - this.currentSecondUsage,
      lastReset: new Date(this.lastReset)
    };
  }

  // Estimate quota needed for a city's hexagons
  estimateQuotaForCity(
    hexagonCount: number, 
    averageSearchPointsPerHexagon: number = 7,
    estimatedPagesPerSearch: number = 1.5
  ): QuotaEstimate {
    const estimatedCalls = hexagonCount * averageSearchPointsPerHexagon * estimatedPagesPerSearch;
    const currentDailyUsage = this.dailyUsage;
    const remainingQuota = this.dailyLimit - currentDailyUsage;
    const canProcessRequest = estimatedCalls <= remainingQuota;
    
    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const recommendations: string[] = [];
    
    if (estimatedCalls > remainingQuota * 0.8) {
      riskLevel = 'critical';
      recommendations.push('Request exceeds 80% of remaining quota');
      recommendations.push('Consider processing in smaller batches');
      recommendations.push('Wait for daily quota reset');
    } else if (estimatedCalls > remainingQuota * 0.6) {
      riskLevel = 'high';
      recommendations.push('Request uses significant portion of remaining quota');
      recommendations.push('Monitor usage closely');
    } else if (estimatedCalls > remainingQuota * 0.4) {
      riskLevel = 'medium';
      recommendations.push('Request uses moderate portion of remaining quota');
      recommendations.push('Proceed with caution');
    } else {
      riskLevel = 'low';
      recommendations.push('Request well within quota limits');
      recommendations.push('Safe to proceed');
    }
    
    return {
      estimatedCalls,
      currentDailyUsage,
      remainingQuota,
      canProcessRequest,
      riskLevel,
      recommendations
    };
  }

  // Optimize processing strategy based on quota
  optimizeProcessingStrategy(
    totalHexagons: number,
    targetCompletionTime: number = 24 * 60 * 60 * 1000 // 24 hours in ms
  ): QuotaOptimization {
    const remainingQuota = this.dailyLimit - this.dailyUsage;
    const maxHexagonsPerDay = Math.floor(remainingQuota / 7); // 7 search points per hexagon average
    
    // Calculate optimal batch size
    const estimatedCallsPerHexagon = 7; // Primary + 6 coverage points
    const maxBatchSize = Math.min(50, Math.floor(remainingQuota / estimatedCallsPerHexagon));
    
    // Estimate processing time
    const estimatedProcessingTime = (totalHexagons / maxBatchSize) * (1000 / this.perSecondLimit); // ms
    
    // Calculate cost efficiency (hexagons per API call)
    const costEfficiency = 1 / estimatedCallsPerHexagon;
    
    return {
      maxHexagonsPerDay,
      recommendedBatchSize: maxBatchSize,
      estimatedProcessingTime,
      costEfficiency
    };
  }

  // Check if we can process a specific request
  canProcessRequest(estimatedCalls: number): boolean {
    const remainingQuota = this.dailyLimit - this.dailyUsage;
    const canProcess = estimatedCalls <= remainingQuota;
    
    return canProcess;
  }

  // Get quota usage trends
  getUsageTrends(): {
    currentHour: number;
    estimatedHourlyRate: number;
    projectedDailyUsage: number;
    timeToQuotaReset: number;
  } {
    const now = Date.now();
    const timeSinceReset = now - this.lastReset;
    const hoursSinceReset = timeSinceReset / (1000 * 60 * 60);
    
    const currentHour = Math.floor(hoursSinceReset);
    const estimatedHourlyRate = this.dailyUsage / Math.max(hoursSinceReset, 1);
    const projectedDailyUsage = estimatedHourlyRate * 24;
    
    const nextReset = this.lastReset + (24 * 60 * 60 * 1000);
    const timeToQuotaReset = nextReset - now;
    
    return {
      currentHour,
      estimatedHourlyRate,
      projectedDailyUsage,
      timeToQuotaReset
    };
  }

  // Reset quota manually (for testing)
  resetQuota(): void {
    this.dailyUsage = 0;
    this.currentSecondUsage = 0;
    this.lastReset = Date.now();
    this.lastSecondReset = Date.now();
  }

  // Get detailed quota report
  getDetailedReport(): string {
    const status = this.getQuotaStatus();
    const trends = this.getUsageTrends();
    
    return `
📊 API Quota Detailed Report
============================
Daily Usage: ${status.dailyUsed}/${this.dailyLimit} (${status.dailyUsagePercentage.toFixed(1)}%)
Remaining: ${status.dailyRemaining} calls
Per-Second: ${status.perSecondUsed}/${this.perSecondLimit}
Current Hour: ${trends.currentHour}
Hourly Rate: ${trends.estimatedHourlyRate.toFixed(1)} calls/hour
Projected Daily: ${trends.projectedDailyUsage.toFixed(0)} calls
Time to Reset: ${(trends.timeToQuotaReset / (1000 * 60 * 60)).toFixed(1)} hours
Last Reset: ${new Date(status.lastReset).toISOString()}
    `.trim();
  }
}

// Global quota manager instance
export const yelpQuotaManager = new APIQuotaManager(5000, 50);
