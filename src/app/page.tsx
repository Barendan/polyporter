'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import dynamic from 'next/dynamic';
import type { EnhancedCityResponse } from '@/lib/geography/cityTypes';
import LoadingModal from '../components/LoadingModal';

// Dynamically import the map component to avoid SSR issues
const CityMap = dynamic(() => import('../components/CityMap/index'), { ssr: false });

interface FormData {
  cityName: string;
}

const LOADING_STEPS = [
  'Searching for city boundary...',
  'Processing city data...',
  'Generating hexagon grid...',
  'Finalizing map...'
];

export default function Home() {
  const [cityData, setCityData] = useState<EnhancedCityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();

  // Simulate progress steps during loading
  useEffect(() => {
    if (!loading) {
      setLoadingStep(1);
      return;
    }

    // Progress through steps with timing
    const stepTimers: NodeJS.Timeout[] = [];
    
    // Step 1: Start immediately
    // Step 2: After 0.5s
    stepTimers.push(setTimeout(() => setLoadingStep(2), 500));
    // Step 3: After 1.5s
    stepTimers.push(setTimeout(() => setLoadingStep(3), 1500));
    // Step 4: After 2.5s (will be overridden when API completes)
    stepTimers.push(setTimeout(() => setLoadingStep(4), 2500));

    return () => {
      stepTimers.forEach(timer => clearTimeout(timer));
    };
  }, [loading]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setLoadingStep(1);
    setError(null);
    setStats(null);

    try {
      // Step 1: Searching
      setLoadingStep(1);
      
      const response = await fetch(`/api/city?name=${encodeURIComponent(data.cityName)}`);
      
      // Step 2: Processing
      setLoadingStep(2);
      
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch city data');
      }

      // Step 3: Generating grid
      setLoadingStep(3);
      
      setCityData(result);
      
      // Calculate enhanced stats
      const geojson = result.geojson;
      let ringCount = 0;

      if (geojson.geometry.type === 'Polygon') {
        ringCount = geojson.geometry.coordinates.length;
      } else if (geojson.geometry.type === 'MultiPolygon') {
        ringCount = geojson.geometry.coordinates.reduce((acc: number, polygon: number[][][]) =>
          acc + polygon.length, 0);
      }

      // Enhanced stats including H3 grid information
      const gridStats = result.grid_stats;
      const enhancedStats = `${ringCount} polygon ring${ringCount !== 1 ? 's' : ''} rendered via ${result.source} | ${gridStats.total_hexagons} H3 hexagons (${gridStats.coverage_area_km2.toFixed(1)} km² coverage)`;
      
      setStats(enhancedStats);
      
      // Step 4: Finalizing
      setLoadingStep(4);
      
      // Small delay before closing to show completion
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
      setLoadingStep(1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <LoadingModal 
        isOpen={loading}
        currentStep={loadingStep}
        totalSteps={LOADING_STEPS.length}
        stepLabels={LOADING_STEPS}
      />
      
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Rylon1
          </h1>
          <p className="text-gray-600">
            View precise restaurant locations in a city
          </p>
        </header>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <form onSubmit={handleSubmit(onSubmit)} className="flex gap-4">
            <div className="flex-1">
              <input
                {...register('cityName', { required: 'City name is required' })}
                type="text"
                placeholder="Miami, FL"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium text-gray-900"
                disabled={loading}
              />
              {errors.cityName && (
                <p className="text-red-500 text-sm mt-1">{errors.cityName.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Loading...' : 'View City'}
            </button>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}


        {/* Enhanced Grid Statistics */}
        {cityData && cityData.grid_stats && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-green-800 mb-3">H3 Grid Analysis</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{cityData.grid_stats.total_hexagons}</div>
                <div className="text-sm text-green-700">Total Hexagons</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {cityData.grid_stats.resolution}
                  {cityData.grid_stats.resolution === 7 && cityData.h3_grid && cityData.h3_grid.length > 0 && (
                    <span className="text-sm text-green-500 block">(Base Resolution)</span>
                  )}
                </div>
                <div className="text-sm text-green-700">Grid Resolution</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{cityData.grid_stats.avg_hexagon_size_km.toFixed(1)}</div>
                <div className="text-sm text-green-700">Avg Hex Size (km²)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{cityData.grid_stats.coverage_area_km2.toFixed(1)}</div>
                <div className="text-sm text-green-700">Coverage Area (km²)</div>
              </div>
            </div>
           
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm p-6">
          <CityMap cityData={cityData} />
        </div>

                            {cityData && (
                      <div className="mt-4 text-center text-sm text-gray-600">
                        <p>Showing: <strong>{cityData.name}</strong> (OSM ID: {cityData.osm_id})</p>
                        <p className="text-xs text-gray-500 mt-1">Data source: {cityData.source}</p>
                      </div>
                    )}
      </div>
    </div>
  );
}
