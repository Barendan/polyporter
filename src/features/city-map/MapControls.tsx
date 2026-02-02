'use client';

import type { EnhancedCityResponse } from '@/shared/geography/cityTypes';

interface MapControlsProps {
  cityData: EnhancedCityResponse | null;
  showBuffered: boolean;
  showH3Grid: boolean;
  showHexagonNumbers: boolean;
  showRestaurants: boolean;
  onToggleBuffered: () => void;
  onToggleH3Grid: () => void;
  onToggleHexagonNumbers: () => void;
  onToggleRestaurants: () => void;
}

export default function MapControls({
  cityData,
  showBuffered,
  showH3Grid,
  showHexagonNumbers,
  showRestaurants,
  onToggleBuffered,
  onToggleH3Grid,
  onToggleHexagonNumbers,
  onToggleRestaurants
}: MapControlsProps) {
  if (!cityData) return null;

  return (
    <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-50 rounded-lg border">
      {/* Clickable Legend Items */}
      <div className="flex flex-wrap gap-4 text-xs">
        {/* City Boundary - Always visible, not toggleable */}
        <div className="flex items-center space-x-2 text-gray-600">
          <div className="w-4 h-4 bg-blue-600 rounded opacity-80"></div>
          <span>City Boundary</span>
        </div>
        
        {/* Buffered Area - Clickable */}
        <button
          onClick={onToggleBuffered}
          className={`flex items-center space-x-2 transition-opacity ${
            showBuffered ? 'opacity-100' : 'opacity-50'
          } hover:opacity-100 cursor-pointer`}
        >
          <div className={`w-4 h-4 bg-purple-600 rounded ${showBuffered ? 'opacity-60' : 'opacity-30'}`}></div>
          <span className="text-gray-700 font-medium">Buffered Area (1km)</span>
          {showBuffered && <span className="text-purple-600">✓</span>}
        </button>
        
        {/* H3 Grid - Clickable */}
        <button
          onClick={onToggleH3Grid}
          className={`flex items-center space-x-2 transition-opacity ${
            showH3Grid ? 'opacity-100' : 'opacity-50'
          } hover:opacity-100 cursor-pointer`}
        >
          <div className={`w-4 h-4 bg-green-600 rounded ${showH3Grid ? 'opacity-40' : 'opacity-20'}`}></div>
          <span className="text-gray-700 font-medium">H3 Grid ({cityData.grid_stats.total_hexagons} hexs)</span>
          {showH3Grid && <span className="text-green-600">✓</span>}
        </button>
        
        {/* Hexagon Numbers - Clickable */}
        <button
          onClick={onToggleHexagonNumbers}
          className={`flex items-center space-x-2 transition-opacity ${
            showHexagonNumbers ? 'opacity-100' : 'opacity-50'
          } hover:opacity-100 cursor-pointer`}
        >
          <div className={`w-4 h-4 bg-white-600 rounded-full border-2 ${showHexagonNumbers ? 'border-green-600' : 'border-gray-400'}`}></div>
          <span className="text-gray-700 font-medium">Hexagon Numbers</span>
          {showHexagonNumbers && <span className="text-orange-600">✓</span>}
        </button>
        
        {/* Restaurants - Clickable */}
        <button
          onClick={onToggleRestaurants}
          className={`flex items-center space-x-2 transition-opacity ${
            showRestaurants ? 'opacity-100' : 'opacity-50'
          } hover:opacity-100 cursor-pointer`}
        >
          <div className={`w-4 h-4 bg-red-600 rounded ${showRestaurants ? 'opacity-80' : 'opacity-30'}`}></div>
          <span className="text-gray-700 font-medium">Restaurants</span>
          {showRestaurants && <span className="text-red-600">✓</span>}
        </button>
      </div>
      
    </div>
  );
}
