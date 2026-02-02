export class RateLimiter {
  private dailyCalls: number = 0;
  private lastReset: number = Date.now();
  private perSecondCalls: number = 0;
  private lastSecondReset: number = Date.now();
  private requestQueue: Array<() => void> = [];
  private isProcessing: boolean = false;
  private lastRequestTime: number = 0; // Track when last request was made
  private minRequestInterval: number; // Minimum milliseconds between requests

  constructor(
    private maxPerSecond: number = 10, // FIXED: Lowered from 50 to 10 for safety (Yelp doesn't specify exact limit)
    private maxPerDay: number = 5000
  ) {
    // Calculate minimum interval between requests to stay under limit
    // If maxPerSecond is 10, we need at least 100ms between requests (1000ms / 10 = 100ms)
    // Use 80% of that to be safe: 80ms minimum between requests
    this.minRequestInterval = Math.max(80, (1000 / maxPerSecond) * 0.8);
    
    // Reset daily counter every 24 hours
    setInterval(() => this.resetDailyCounter(), 24 * 60 * 60 * 1000);
    
    // Reset per-second counter every second
    setInterval(() => this.resetPerSecondCounter(), 1000);
  }

  private resetDailyCounter(): void {
    this.dailyCalls = 0;
    this.lastReset = Date.now();
  }

  private resetPerSecondCounter(): void {
    this.perSecondCalls = 0;
    this.lastSecondReset = Date.now();
  }

  private canMakeRequest(): boolean {
    
    // Check daily limit
    if (this.dailyCalls >= this.maxPerDay) {
      return false;
    }
    
    // Check per-second limit
    if (this.perSecondCalls >= this.maxPerSecond) {
      return false;
    }
    
    return true;
  }

  // FIXED: Now actually throttles requests with minimum spacing
  async waitForSlot(): Promise<void> {
    return new Promise(async (resolve) => {
      // Always wait minimum interval to prevent hitting rate limits
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.minRequestInterval) {
        const waitTime = this.minRequestInterval - timeSinceLastRequest;
        await new Promise(r => setTimeout(r, waitTime));
      }
      
      // Check if we can make a request (daily/secondly limits)
      if (this.canMakeRequest()) {
        this.makeRequest();
        this.lastRequestTime = Date.now();
        resolve();
      } else {
        // Add to queue and process when possible
        this.requestQueue.push(() => {
          this.makeRequest();
          this.lastRequestTime = Date.now();
          resolve();
        });
        this.processQueue();
      }
    });
  }

  private makeRequest(): void {
    this.dailyCalls++;
    this.perSecondCalls++;
  }

  // FIXED: Process queue with proper throttling
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    while (this.requestQueue.length > 0) {
      // Wait for minimum interval before processing next request
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.minRequestInterval) {
        const waitTime = this.minRequestInterval - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Check if we can make a request
      if (this.canMakeRequest()) {
        const nextRequest = this.requestQueue.shift();
        if (nextRequest) {
          nextRequest();
          this.lastRequestTime = Date.now();
        }
      } else {
        // Can't make request now, wait a bit and try again
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    this.isProcessing = false;
  }

  getQuotaStatus(): { dailyUsed: number; dailyRemaining: number; perSecondUsed: number; perSecondRemaining: number } {
    return {
      dailyUsed: this.dailyCalls,
      dailyRemaining: this.maxPerDay - this.dailyCalls,
      perSecondUsed: this.perSecondCalls,
      perSecondRemaining: this.maxPerSecond - this.perSecondCalls
    };
  }

  getDailyUsagePercentage(): number {
    return (this.dailyCalls / this.maxPerDay) * 100;
  }

  resetDailyQuota(): void {
    this.dailyCalls = 0;
    this.lastReset = Date.now();
  }
}

// Global rate limiter instance
// FIXED: Lowered to 10 req/sec (conservative) to prevent 503 errors
// Yelp doesn't specify exact QPS limit, but 10/sec is safe and prevents rate limit issues
export const yelpRateLimiter = new RateLimiter(10, 5000);

