'use client';

import { EnhancedCityResponse } from '@/lib/geo';

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
    <>
      {/* Layer Controls */}
      <div className="flex flex-wrap gap-3 p-3 bg-gray-50 rounded-lg border">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showBuffered}
            onChange={onToggleBuffered}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Show Buffered Area (1km)
          </span>
        </label>
        
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showH3Grid}
            onChange={onToggleH3Grid}
            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Show H3 Grid ({cityData.grid_stats.total_hexagons} hexagons)
          </span>
        </label>
        
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showHexagonNumbers}
            onChange={onToggleHexagonNumbers}
            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Show Hexagon Numbers
          </span>
        </label>
        
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showRestaurants}
            onChange={onToggleRestaurants}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm font-medium text-gray-700">
            🍕 Show Restaurants
          </span>
        </label>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-blue-600 rounded opacity-80"></div>
          <span>City Boundary</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-purple-600 rounded opacity-60"></div>
          <span>Buffered Area (1km)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-green-600 rounded opacity-40"></div>
          <span>H3 Grid (Resolution 7)</span>
        </div>
        {showHexagonNumbers && (
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-orange-600 rounded-full border-2 border-green-600"></div>
            <span>Hexagon Numbers</span>
          </div>
        )}
      </div>
    </>
  );
}
