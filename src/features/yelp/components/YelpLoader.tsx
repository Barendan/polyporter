'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface YelpLoaderProps {
  isOpen: boolean;
  remaining: number;
  total: number;
  processed: number;
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
}

export default function YelpLoader({ 
  isOpen, 
  remaining, 
  total, 
  processed,
  currentPhase = 'phase1',
  phase1Total = 0,
  phase1Processed = 0,
  phase2Total = 0,
  phase2Processed = 0,
  elapsedTime = 0,
  estimatedTimeRemaining = null,
  actualApiCalls = 0,
  estimatedTotalApiCalls = 0,
  lastRestaurantCount = 0
}: YelpLoaderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
  const phaseLabel = currentPhase === 'phase1' ? 'Processing hexagons' : 'Processing subdivisions';
  
  // Format time helpers
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm yelp-loader-backdrop" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full mx-4 border border-gray-200 relative yelp-loader-modal" style={{ zIndex: 10000 }}>
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-3">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Loading Restaurant Data
          </h3>
          <p className="text-sm text-gray-500">{phaseLabel}</p>
        </div>

        {/* Progress Info */}
        <div className="space-y-4">
          {/* API Request tracking - main focus */}
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {actualApiCalls > 0 && estimatedTotalApiCalls > 0 ? (
                <>
                  Request {actualApiCalls.toLocaleString()} of ~{estimatedTotalApiCalls.toLocaleString()}
                </>
              ) : (
                remaining.toLocaleString()
              )}
            </div>
            <div className="text-sm font-medium text-gray-600">
              {actualApiCalls > 0 && estimatedTotalApiCalls > 0 ? (
                'API requests'
              ) : (
                remaining === 1 ? 'data point remaining' : 'data points remaining'
              )}
            </div>
            {/* Last restaurant count - small font below */}
            {lastRestaurantCount > 0 && (
              <div className="text-xs text-gray-500 mt-2">
                {lastRestaurantCount} restaurant{lastRestaurantCount !== 1 ? 's' : ''} from last hexagon
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-gray-600">Progress</span>
              <span className="text-xs font-semibold text-blue-600">{percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{processed.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Processed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">{total.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
          </div>

          {/* Phase Breakdown - only show if we have phase data */}
          {(phase1Total > 0 || phase2Total > 0) && (
            <div className="pt-2 border-t border-gray-100">
              <div className="text-xs font-medium text-gray-600 mb-2">Phase Progress</div>
              <div className="space-y-2">
                {phase1Total > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Phase 1 (Hexagons)</span>
                    <span className="font-semibold text-gray-900">
                      {phase1Processed}/{phase1Total}
                    </span>
                  </div>
                )}
                {phase2Total > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Phase 2 (Subdivisions)</span>
                    <span className="font-semibold text-gray-900">
                      {phase2Processed}/{phase2Total}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Time Information */}
          {(elapsedTime > 0 || estimatedTimeRemaining !== null) && (
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">Elapsed Time</span>
                <span className="font-semibold text-gray-900">{formatTime(elapsedTime)}</span>
              </div>
              {estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 && (
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-gray-600">Est. Remaining</span>
                  <span className="font-semibold text-blue-600">{formatTime(estimatedTimeRemaining)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render in a portal at document body level to ensure it's above everything
  return createPortal(modalContent, document.body);
}

