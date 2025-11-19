'use client';

import { useState, useEffect, useRef } from 'react';
import type { EnhancedCityResponse } from '@/lib/geography/cityTypes';
import YelpLoader from '../YelpLoader';

// Define interfaces for Yelp testing state
interface Restaurant {
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
}

interface HexagonResult {
  h3Id: string;
  mapIndex?: number; // Map hexagon number for correlation
  status: 'fetched' | 'failed' | 'dense' | 'split';
  totalBusinesses: number;
  uniqueBusinesses: Restaurant[];
  searchResults: Restaurant[];
  coverageQuality: string;
  error?: string;
}

interface YelpTestResult {
  success?: boolean;
  results?: HexagonResult[];
  newBusinesses?: Restaurant[]; // Only new restaurants added to staging
  testMode?: boolean;
  processedAt?: string;
  error?: string;
  importLogId?: string | null; // Import log ID for tracking approved restaurants
  cityId?: string | null; // City ID for creating staging records
  processingStats?: {
    totalHexagons: number;
    processedHexagons: number;
    successfulHexagons: number;
    failedHexagons: number;
    limitedHexagons: number;
    totalRequested: number;
    restaurantsFetched?: number;
    duplicatesSkipped?: number;
    validationErrors?: number;
    newRestaurantsCount?: number;
  };
}

interface ProcessingStatus {
  processingStats?: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    split: number;
  };
}

interface QuotaStatus {
  quotaStatus?: {
    dailyUsed: number;
    dailyLimit: number;
    dailyUsagePercentage: number;
    perSecondUsed: number;
    perSecondLimit: number;
    lastReset: Date;
  };
}

interface YelpIntegrationProps {
  cityData: EnhancedCityResponse | null;
  onResultsUpdate: (results: YelpTestResult) => void;
}

export default function YelpIntegration({ cityData, onResultsUpdate }: YelpIntegrationProps) {
  const [yelpTesting, setYelpTesting] = useState(false);
  const [yelpResults, setYelpResults] = useState<YelpTestResult | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [testMode, setTestMode] = useState(false); // Toggle between test and real mode
  const [progress, setProgress] = useState<{ 
    total: number; 
    processed: number; 
    remaining: number; 
    currentPhase?: 'phase1' | 'phase2';
    phase1Total?: number;
    phase1Processed?: number;
    phase2Total?: number;
    phase2Processed?: number;
    elapsedTime?: number;
    estimatedTimeRemaining?: number | null;
    actualApiCalls?: number;
    estimatedTotalApiCalls?: number;
    lastRestaurantCount?: number;
  } | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const totalHexagonsRef = useRef<number>(0);

  // Check if we should render - moved after all hooks to follow Rules of Hooks
  const shouldRender = cityData && cityData.h3_grid && cityData.h3_grid.length > 0;

  // Helper function to calculate accurate API call estimates
  const calculateAPICalls = (hexagonCount: number): number => {
    // Resolution 7 hexagons are ~4.8 km², which fall in the "medium" category (3-8 km²)
    // Medium hexagons use 3 search points (1 primary + 2 corners)
    // Each search point makes at least 1 API call, with potential pagination
    // Average: 3 search points × 1.2 API calls per point (accounting for occasional pagination)
    const avgSearchPointsPerHexagon = 3; // Medium hexagons (resolution 7)
    const avgAPICallsPerSearchPoint = 1.2; // Most searches don't need pagination, but some do
    return Math.round(hexagonCount * avgSearchPointsPerHexagon * avgAPICallsPerSearchPoint);
  };

  // Helper function to get random hexagons with geographic distribution
  const getRandomHexagons = (hexagons: string[], count: number): string[] => {
    if (hexagons.length <= count) return hexagons;
    
    // Simple random selection for now - can be enhanced with stratification later
    const shuffled = [...hexagons].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  // Poll for progress updates
  useEffect(() => {
    if (yelpTesting && totalHexagonsRef.current > 0) {
      const pollProgress = async () => {
        try {
          const response = await fetch('/api/yelp/search?action=status');
          if (response.ok) {
            const status = await response.json();
            if (status.progress) {
              setProgress(status.progress);
            }
          }
        } catch (error) {
          // Silently fail - don't spam errors
        }
      };

      // Poll immediately, then every 1.5 seconds (less aggressive to avoid dev server noise)
      pollProgress();
      pollingIntervalRef.current = setInterval(pollProgress, 1500);

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };
    } else {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setProgress(null);
    }
  }, [yelpTesting]);

  // Add Yelp testing function
  const testYelpIntegration = async (mode?: boolean) => {
    if (!cityData?.h3_grid || cityData.h3_grid.length === 0) {
      console.error('No H3 grid available for Yelp testing');
      return;
    }

    // Use provided mode or current testMode state
    const useTestMode = mode !== undefined ? mode : testMode;
    
    setYelpTesting(true);
    setProgress(null);
    if (mode !== undefined) {
      setTestMode(mode);
    }
    
    try {
      let hexagonData: Array<{ h3Id: string; mapIndex: number; originalIndex: number }>;
      let totalHexagons = 0;
      
      if (useTestMode) {
        // Test Mode: Use 5 randomly selected hexagons with real Yelp API calls
        const maxTestHexagons = 5;
        const randomHexagons = getRandomHexagons(cityData!.h3_grid, maxTestHexagons);
        
        hexagonData = randomHexagons.map((h3Id, index) => ({
          h3Id,
          mapIndex: cityData!.h3_grid.indexOf(h3Id), // Use actual grid index
          originalIndex: cityData!.h3_grid.indexOf(h3Id)
        }));
        totalHexagons = maxTestHexagons;
      } else {
        // Real Mode: Use all hexagons with real Yelp API calls
        hexagonData = cityData!.h3_grid.map((h3Id, index) => ({
          h3Id,
          mapIndex: index,
          originalIndex: index
        }));
        totalHexagons = cityData!.h3_grid.length;
      }
      
      totalHexagonsRef.current = totalHexagons;
      setProgress({ total: totalHexagons, processed: 0, remaining: totalHexagons, currentPhase: 'phase1' });
      
      const response = await fetch('/api/yelp/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'process_hexagons',
          hexagons: hexagonData,
          cityName: cityData!.name,
          testMode: useTestMode
        }),
      });

      if (!response.ok) {
        throw new Error(`Yelp API error: ${response.status}`);
      }

      const result = await response.json();
      setYelpResults(result);
      onResultsUpdate(result);
      
    } catch (error) {
      console.error('❌ Yelp integration test failed:', error);
      const errorResult = { error: error instanceof Error ? error.message : 'Unknown error' };
      setYelpResults(errorResult);
      onResultsUpdate(errorResult);
    } finally {
      setYelpTesting(false);
      setProgress(null);
      totalHexagonsRef.current = 0;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  };

  // Add function to get processing status (toggleable)
  const getProcessingStatus = async () => {
    // Toggle: if already showing, hide it
    if (processingStatus) {
      setProcessingStatus(null);
      return;
    }
    
    // Otherwise, fetch and show
    try {
      const response = await fetch('/api/yelp?action=status');
      if (response.ok) {
        const status = await response.json();
        setProcessingStatus(status);
      }
    } catch (error) {
      console.error('Error getting processing status:', error);
    }
  };

  // Add function to get quota status (toggleable)
  const getQuotaStatus = async () => {
    // Toggle: if already showing, hide it
    if (quotaStatus) {
      setQuotaStatus(null);
      return;
    }
    
    // Otherwise, fetch and show
    try {
      const response = await fetch('/api/yelp/search?action=quota');
      if (response.ok) {
        const quota = await response.json();
        setQuotaStatus(quota);
      }
    } catch (error) {
      console.error('Error getting quota status:', error);
    }
  };

  // Early return after all hooks - this is safe per Rules of Hooks
  if (!shouldRender) {
    return null;
  }

  return (
    <>
      <YelpLoader
        isOpen={yelpTesting && progress !== null}
        remaining={progress?.remaining || 0}
        total={progress?.total || 0}
        processed={progress?.processed || 0}
        currentPhase={progress?.currentPhase || 'phase1'}
        phase1Total={progress?.phase1Total}
        phase1Processed={progress?.phase1Processed}
        phase2Total={progress?.phase2Total}
        phase2Processed={progress?.phase2Processed}
        elapsedTime={progress?.elapsedTime}
        estimatedTimeRemaining={progress?.estimatedTimeRemaining}
        actualApiCalls={progress?.actualApiCalls}
        estimatedTotalApiCalls={progress?.estimatedTotalApiCalls}
        lastRestaurantCount={progress?.lastRestaurantCount}
      />
      
      <div className="mt-4 p-4 bg-white rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-3 text-black">Yelp Integration Testing</h3>
      
      
      <div className="space-y-3">
        
        {/* API Call Estimation Display */}
        <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded">
          <p className="text-sm text-orange-800 font-medium mb-2">📊 API Call Estimation:</p>
          <div className="text-xs text-orange-700 space-y-1">
            <div className="flex justify-between">
              <span>Total Hexagons:</span>
              <span className="font-mono font-medium">{cityData!.h3_grid.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Search Points per Hexagon (Resolution 7):</span>
              <span className="font-mono font-medium">~3 points</span>
            </div>
            <div className="flex justify-between">
              <span>API Calls per Search Point:</span>
              <span className="font-mono font-medium">~1.2 calls</span>
            </div>
            <div className="flex justify-between">
              <span>Test Mode (10 random hexagons):</span>
              <span className="font-mono font-medium text-orange-600">
                ~{calculateAPICalls(10)} API calls
              </span>
            </div>
            <div className="flex justify-between">
              <span>Real Mode (all hexagons):</span>
              <span className="font-mono font-medium text-red-600">
                ~{calculateAPICalls(cityData!.h3_grid.length)} API calls
              </span>
            </div>

          </div>
        </div>
        
        {/* Two side-by-side buttons for Test and Real Mode */}
        <div className="flex gap-3">
          <button
            onClick={() => testYelpIntegration(true)}
            disabled={yelpTesting}
            className="flex-1 px-6 py-4 bg-gradient-to-br from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-gray-900 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center space-y-1.5 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] border-2 border-yellow-500/30 transform"
          >
            {yelpTesting && testMode ? (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-3 border-gray-900 border-t-transparent"></div>
                <span className="text-base font-bold tracking-wide">Processing...</span>
              </>
            ) : (
              <>
                <div className="mb-1 p-2 bg-yellow-300/30 rounded-full">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
                <span className="text-lg font-bold tracking-tight text-gray-900">Test Mode</span>
                <span className="text-xs font-semibold text-gray-700 bg-yellow-200/50 px-2 py-1 rounded-full">~{calculateAPICalls(10)} calls</span>
              </>
            )}
          </button>
          
          <button
            onClick={() => testYelpIntegration(false)}
            disabled={yelpTesting}
            className="flex-1 px-6 py-4 bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center space-y-1.5 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] border-2 border-emerald-600/30 transform"
          >
            {yelpTesting && !testMode ? (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-3 border-white border-t-transparent"></div>
                <span className="text-base font-bold tracking-wide">Processing...</span>
              </>
            ) : (
              <>
                <div className="mb-1 p-2 bg-emerald-400/30 rounded-full">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <span className="text-lg font-bold tracking-tight text-white">Real Mode</span>
                <span className="text-xs font-semibold text-emerald-50 bg-emerald-600/40 px-2 py-1 rounded-full">~{calculateAPICalls(cityData.h3_grid.length)} calls</span>
              </>
            )}
          </button>
        </div>
        
        <button
          onClick={getProcessingStatus}
          className={`px-4 py-2 rounded hover:opacity-90 ml-2 transition-colors ${
            processingStatus 
              ? 'bg-blue-700 text-white' 
              : 'bg-blue-600 text-white'
          }`}
        >
          {processingStatus ? 'Hide Status' : 'Get Status'}
        </button>
        
        <button
          onClick={getQuotaStatus}
          className={`px-4 py-2 rounded hover:opacity-90 ml-2 transition-colors ${
            quotaStatus 
              ? 'bg-purple-700 text-white' 
              : 'bg-purple-600 text-white'
          }`}
        >
          {quotaStatus ? 'Hide Quota' : 'Get Quota'}
        </button>
      </div>
      
      {/* Display error if test failed */}
      {yelpResults && yelpResults.error && (
        <div className="mt-4 p-4 rounded-lg border bg-red-50 border-red-300">
          <h4 className="font-medium mb-3 flex items-center text-red-800">
            ❌ Test Failed
          </h4>
          <div className="text-red-700 font-medium bg-red-100 p-3 rounded border border-red-200">
            {yelpResults.error}
          </div>
        </div>
      )}
      
      {/* Display processing status */}
      {processingStatus && (
        <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-300">
          <h4 className="font-medium mb-2 text-blue-800">Processing Status:</h4>
          <div className="text-sm space-y-1 text-blue-900">
            <div className="font-medium">📊 Queued: {processingStatus.processingStats?.queued || 0}</div>
            <div>🔧 Processing: {processingStatus.processingStats?.processing || 0}</div>
            <div>✅ Completed: {processingStatus.processingStats?.completed || 0}</div>
            <div>❌ Failed: {processingStatus.processingStats?.failed || 0}</div>
            <div>🔀 Split: {processingStatus.processingStats?.split || 0}</div>
          </div>
        </div>
      )}
      
      {/* Display quota status */}
      {quotaStatus && (
        <div className="mt-4 p-3 bg-yellow-50 rounded border border-yellow-300">
          <h4 className="font-medium mb-2 text-yellow-800">Quota Status:</h4>
          <div className="text-sm space-y-1 text-yellow-900">
            <div className="font-medium">📊 Daily Usage: {quotaStatus.quotaStatus?.dailyUsed || 0}/{quotaStatus.quotaStatus?.dailyLimit || 0}</div>
            <div>📈 Usage: {quotaStatus.quotaStatus?.dailyUsagePercentage?.toFixed(1) || 0}%</div>
            <div>⏰ Per Second: {quotaStatus.quotaStatus?.perSecondUsed || 0}/{quotaStatus.quotaStatus?.perSecondLimit || 0}</div>
            <div>🔄 Last Reset: {quotaStatus.quotaStatus?.lastReset?.toLocaleString() || 'Unknown'}</div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
