'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface LoadingModalProps {
  isOpen: boolean;
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export default function LoadingModal({ isOpen, currentStep, totalSteps, stepLabels }: LoadingModalProps) {
  const [progress, setProgress] = useState(0);
  const [pulseAnimation, setPulseAnimation] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Calculate progress based on current step
      const stepProgress = ((currentStep - 1) / totalSteps) * 100;
      setProgress(stepProgress);
      
      // Pulse animation for active step
      const interval = setInterval(() => {
        setPulseAnimation(prev => (prev + 1) % 3);
      }, 600);
      
      return () => clearInterval(interval);
    }
  }, [isOpen, currentStep, totalSteps]);

  if (!isOpen || !mounted) return null;

  const currentLabel = stepLabels[currentStep - 1] || 'Processing...';

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" style={{ zIndex: 9999 }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 transform animate-in zoom-in-95 duration-300" style={{ zIndex: 10000 }}>
        {/* Header with animated icon */}
        <div className="text-center mb-6">
          <div className="relative inline-block mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center animate-spin">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full animate-ping opacity-75"></div>
          </div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Loading City Data
          </h2>
          <p className="text-gray-500 mt-2 text-sm">Please wait while we fetch your city...</p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm font-semibold text-blue-600">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-white/30 animate-shimmer"></div>
            </div>
          </div>
        </div>

        {/* Step indicators */}
        <div className="space-y-3">
          {stepLabels.map((label, index) => {
            const stepNumber = index + 1;
            const isActive = stepNumber === currentStep;
            const isCompleted = stepNumber < currentStep;
            const isPending = stepNumber > currentStep;

            return (
              <div
                key={stepNumber}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-400 shadow-md scale-[1.02]'
                    : isCompleted
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-gray-50 border border-gray-200 opacity-60'
                }`}
              >
                {/* Step number circle */}
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg animate-pulse'
                      : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-300 text-gray-600'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    stepNumber
                  )}
                </div>

                {/* Step label */}
                <span
                  className={`flex-1 font-medium transition-all duration-300 ${
                    isActive
                      ? 'text-blue-700 text-base'
                      : isCompleted
                      ? 'text-green-700'
                      : 'text-gray-500'
                  }`}
                >
                  {label}
                </span>

                {/* Active indicator */}
                {isActive && (
                  <div className="flex-shrink-0 relative">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping absolute"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full relative"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Fun loading message */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400 italic">
            {currentStep === 1 && "🌍 Searching the globe..."}
            {currentStep === 2 && "🗺️ Drawing boundaries..."}
            {currentStep === 3 && "⚡ Generating hexagon grid..."}
            {currentStep === 4 && "✨ Almost there..."}
          </p>
        </div>
      </div>
    </div>
  );

  // Render in a portal at document body level to ensure it's above everything (including Leaflet maps)
  return createPortal(modalContent, document.body);
}

