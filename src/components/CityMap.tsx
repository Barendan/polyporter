'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { EnhancedCityResponse } from '@/lib/geo';

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
  testMode?: boolean;
  processedAt?: string;
  error?: string;
  processingStats?: {
    totalHexagons: number;
    processedHexagons: number;
    successfulHexagons: number;
    failedHexagons: number;
    limitedHexagons: number;
    totalRequested: number;
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

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CityMapProps {
  cityData: EnhancedCityResponse | null;
}

export default function CityMap({ cityData }: CityMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const cityLayerRef = useRef<L.GeoJSON | null>(null);
  const bufferedLayerRef = useRef<L.GeoJSON | null>(null);
  const h3GridLayerRef = useRef<L.LayerGroup | null>(null);
  
  // Layer visibility state
  const [showBuffered, setShowBuffered] = useState(true);
  const [showH3Grid, setShowH3Grid] = useState(true);
  const [showHexagonNumbers, setShowHexagonNumbers] = useState(true);

  // Add Yelp testing state
  const [yelpTesting, setYelpTesting] = useState(false);
  const [yelpResults, setYelpResults] = useState<YelpTestResult | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [testMode, setTestMode] = useState(false); // Toggle between test and real mode
  
  // Add display method state
  const [expandedHexagons, setExpandedHexagons] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'summary' | 'details' | 'restaurants'>('summary');

  // Initialize map with performance optimizations
  useEffect(() => {
    if (!mapRef.current) {
      console.log('🗺️ Initializing map...');
      
      // Ensure the map container exists and has dimensions
      const mapContainer = document.getElementById('map');
      if (!mapContainer) {
        console.error('❌ Map container not found');
        return;
      }
      
      console.log('📏 Map container dimensions:', {
        width: mapContainer.offsetWidth,
        height: mapContainer.offsetHeight,
        clientWidth: mapContainer.clientWidth,
        clientHeight: mapContainer.clientHeight
      });
      
      const map = L.map('map', {
        preferCanvas: true, // Better performance for many future restaurant markers
        center: [20, 0],
        zoom: 2,
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        attributionControl: true
      });

      // Add OSM tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
      }).addTo(map);

      mapRef.current = map;
      console.log('✅ Map initialized successfully');
      
      // Small delay to ensure map is fully ready
      setTimeout(() => {
        console.log('⏳ Map ready delay completed');
      }, 100);
    }

    // Cleanup function
    return () => {
      if (mapRef.current) {
        console.log('🧹 Cleaning up map...');
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update city data with enhanced styling and layers
  useEffect(() => {
    if (!mapRef.current || !cityData) return;

    const map = mapRef.current;
    
    console.log('🗺️ Adding city data layers to map...');

    // Remove existing layers
    if (cityLayerRef.current) {
      map.removeLayer(cityLayerRef.current);
    }
    if (bufferedLayerRef.current) {
      map.removeLayer(bufferedLayerRef.current);
    }
    if (h3GridLayerRef.current) {
      map.removeLayer(h3GridLayerRef.current);
    }

    // Add original city boundary layer
    const cityLayer = L.geoJSON(cityData.geojson, {
      style: {
        color: '#2563eb',
        weight: 3,
        opacity: 0.8,
        fillColor: '#3b82f6',
        fillOpacity: 0.15
      }
    });

    cityLayer.addTo(map);
    cityLayerRef.current = cityLayer;

    // Add buffered polygon layer
    if (showBuffered) {
      const bufferedLayer = L.geoJSON(cityData.buffered_polygon, {
        style: {
          color: '#7c3aed',
          weight: 2,
          opacity: 0.6,
          fillColor: '#a855f7',
          fillOpacity: 0.1
        }
      });

      bufferedLayer.addTo(map);
      bufferedLayerRef.current = bufferedLayer;
    }

    // Add H3 grid layer
    if (showH3Grid && cityData.h3_grid.length > 0) {
      console.log(`🗺️ Rendering H3 grid with ${cityData.h3_grid.length} hexagons (covering entire buffered area)`);
      const h3GridLayer = L.layerGroup();
      
      // Import h3 dynamically to avoid SSR issues
      const h3 = require('h3-js');
      
      try {
        let renderedCount = 0;
        
        cityData.h3_grid.forEach((h3Index, i) => {
          try {
            const boundary = h3.cellToBoundary(h3Index, true);
            
            // Validate boundary coordinates
            if (!boundary || !Array.isArray(boundary) || boundary.length < 3) {
              console.warn(`⚠️ Invalid boundary for hexagon ${i}: ${h3Index}`);
              return;
            }
            
            // Convert H3 boundary to Leaflet polygon coordinates
            // H3 returns [lng, lat] but Leaflet expects [lat, lng]
            const polygonCoords: [number, number][] = boundary.map((coord: number[]) => [coord[1], coord[0]]); // [lat, lng] for Leaflet
            
            const polygon = L.polygon(polygonCoords, {
              color: '#059669',
              weight: 2,
              opacity: 0.8,
              fillColor: '#10b981',
              fillOpacity: 0.15
            });
            
            // Add hexagon number label (conditionally)
            if (showHexagonNumbers) {
              const center = polygon.getBounds().getCenter();
              const label = L.divIcon({
                className: 'hexagon-label',
                html: `<div style="
                  background: rgba(255, 255, 255, 0.95);
                  border: 2px solid #059669;
                  border-radius: 50%;
                  width: 28px;
                  height: 28px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-weight: bold;
                  font-size: 11px;
                  color: #059669;
                  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.9);
                  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                  font-family: 'Courier New', monospace;
                ">${i}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
              });
              
              const labelMarker = L.marker(center, { icon: label });
              h3GridLayer.addLayer(labelMarker);
              
              // Log first few hexagon numbers for debugging
              if (i < 5) {
                console.log(`🔢 Hexagon ${i} labeled at center: [${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}]`);
              }
            }
            
            h3GridLayer.addLayer(polygon);
            renderedCount++;
            
            // Log first few hexagons for debugging
            if (i < 3) {
              console.log(`🔷 Hexagon ${i}: ${h3Index}, boundary:`, boundary);
              console.log(`🔷 Leaflet coords:`, polygonCoords);
            }
          } catch (hexError) {
            console.warn(`⚠️ Error rendering hexagon ${i}:`, hexError);
          }
        });
        
        if (renderedCount > 0) {
          h3GridLayer.addTo(map);
          h3GridLayerRef.current = h3GridLayer;
          console.log(`✅ H3 grid layer added to map with ${renderedCount} hexagons`);
          if (showHexagonNumbers) {
            console.log(`🔢 Hexagon numbers are ${showHexagonNumbers ? 'enabled' : 'disabled'}`);
          }
          
          // Log the map bounds and zoom level for debugging
          console.log(`🗺️ Map bounds:`, map.getBounds());
          console.log(`🔍 Map zoom level:`, map.getZoom());
          
          // Force a map refresh to ensure hexagons are visible
          map.invalidateSize();
        } else {
          console.warn(`⚠️ No hexagons were successfully rendered`);
        }
        
      } catch (error) {
        console.error('Error rendering H3 grid:', error);
      }
    } else {
      console.log(`⚠️ H3 grid not rendered: showH3Grid=${showH3Grid}, h3_grid.length=${cityData.h3_grid.length}`);
    }

    // Fit bounds to city with padding
    const bounds = cityLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [24, 24],
        maxZoom: 18
      });
    }
  }, [cityData, showBuffered, showH3Grid, showHexagonNumbers]);

  // Toggle layer visibility
  const toggleBuffered = () => {
    setShowBuffered(!showBuffered);
    if (mapRef.current && bufferedLayerRef.current) {
      if (showBuffered) {
        mapRef.current.removeLayer(bufferedLayerRef.current);
      } else {
        bufferedLayerRef.current.addTo(mapRef.current);
      }
    }
  };

  const toggleH3Grid = () => {
    setShowH3Grid(!showH3Grid);
    if (mapRef.current && h3GridLayerRef.current) {
      if (showH3Grid) {
        mapRef.current.removeLayer(h3GridLayerRef.current);
      } else {
        h3GridLayerRef.current.addTo(mapRef.current);
      }
    }
  };

  // Add Yelp testing function
  const testYelpIntegration = async () => {
    if (!cityData?.h3_grid || cityData.h3_grid.length === 0) {
      console.error('No H3 grid available for Yelp testing');
      return;
    }

    setYelpTesting(true);
    
    try {
      console.log(`🍕 Testing Yelp integration with ${cityData.h3_grid.length} hexagons`);
      
      let hexagonData: Array<{ h3Id: string; mapIndex: number; originalIndex: number }>;
      
      if (testMode) {
        // Test Mode: Use 10 randomly selected hexagons with real Yelp API calls
        const maxTestHexagons = 10;
        const randomHexagons = getRandomHexagons(cityData.h3_grid, maxTestHexagons);
        
        hexagonData = randomHexagons.map((h3Id, index) => ({
          h3Id,
          mapIndex: cityData.h3_grid.indexOf(h3Id), // Use actual grid index
          originalIndex: cityData.h3_grid.indexOf(h3Id)
        }));
        
        console.log(`🧪 TEST MODE: Using ${hexagonData.length} randomly selected hexagons with real Yelp API calls`);
      } else {
        // Real Mode: Use all hexagons with real Yelp API calls
        hexagonData = cityData.h3_grid.map((h3Id, index) => ({
          h3Id,
          mapIndex: index,
          originalIndex: index
        }));
        
        console.log(`🍕 REAL MODE: Using all ${hexagonData.length} hexagons with real Yelp API calls`);
      }
      
      console.log(`🔢 Hexagon data with indices:`, hexagonData);
      
      const response = await fetch('/api/yelp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'process_hexagons',
          hexagons: hexagonData,
          cityName: cityData.name,
          testMode: testMode
        }),
      });

      if (!response.ok) {
        throw new Error(`Yelp API error: ${response.status}`);
      }

      const result = await response.json();
      setYelpResults(result);
      
      console.log('✅ Yelp integration test completed:', result);
      
    } catch (error) {
      console.error('❌ Yelp integration test failed:', error);
      setYelpResults({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setYelpTesting(false);
    }
  };

  // Helper function to get random hexagons with geographic distribution
  const getRandomHexagons = (hexagons: string[], count: number): string[] => {
    if (hexagons.length <= count) return hexagons;
    
    // Simple random selection for now - can be enhanced with stratification later
    const shuffled = [...hexagons].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  // Add function to get processing status
  const getProcessingStatus = async () => {
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

  // Add function to get quota status
  const getQuotaStatus = async () => {
    try {
      const response = await fetch('/api/yelp?action=quota');
      if (response.ok) {
        const quota = await response.json();
        setQuotaStatus(quota);
      }
    } catch (error) {
      console.error('Error getting quota status:', error);
    }
  };

  // Helper functions for data processing
  const toggleHexagonExpansion = (h3Id: string) => {
    const newExpanded = new Set(expandedHexagons);
    if (newExpanded.has(h3Id)) {
      newExpanded.delete(h3Id);
    } else {
      newExpanded.add(h3Id);
    }
    setExpandedHexagons(newExpanded);
  };

  const getAllRestaurants = () => {
    if (!yelpResults?.results) return [];
    const allBusinesses = yelpResults.results.flatMap(result => result.uniqueBusinesses || []);
    
    // Deduplicate by business ID
    const uniqueMap = new Map<string, Restaurant>();
    allBusinesses.forEach(business => {
      if (!uniqueMap.has(business.id)) {
        uniqueMap.set(business.id, business);
      }
    });
    
    return Array.from(uniqueMap.values());
  };

  const getDeduplicationStats = () => {
    if (!yelpResults?.results) return { total: 0, unique: 0, duplicates: 0 };
    
    const allBusinesses = yelpResults.results.flatMap(result => result.uniqueBusinesses || []);
    const uniqueBusinesses = getAllRestaurants();
    
    return {
      total: allBusinesses.length,
      unique: uniqueBusinesses.length,
      duplicates: allBusinesses.length - uniqueBusinesses.length
    };
  };



  const getStatusColor = (status: string) => {
    switch (status) {
      case 'fetched': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'dense': return 'text-yellow-600 bg-yellow-100';
      case 'split': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'fetched': return '✅';
      case 'failed': return '❌';
      case 'dense': return '🔀';
      case 'split': return '📊';
      default: return '❓';
    }
  };

  return (
    <div className="space-y-4">
      {/* Layer Controls */}
      {cityData && (
        <div className="flex flex-wrap gap-3 p-3 bg-gray-50 rounded-lg border">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showBuffered}
              onChange={toggleBuffered}
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
              onChange={toggleH3Grid}
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
              onChange={() => setShowHexagonNumbers(!showHexagonNumbers)}
              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Show Hexagon Numbers
            </span>
          </label>
        </div>
      )}
      
      {/* Map Container */}
      <div 
        id="map" 
        className="w-full h-96 rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
        style={{ minHeight: '384px' }}
      />
      
      {/* Legend */}
      {cityData && (
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
      )}

      {/* Add Yelp testing button after the map is loaded */}
      {cityData && cityData.h3_grid && cityData.h3_grid.length > 0 && (
        <div className="mt-4 p-4 bg-white rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-3">🍕 Yelp Integration Testing</h3>
          
          {/* Safety Warning for Test Mode */}
          <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded">
            <p className="text-sm text-yellow-800">
              <strong>🧪 TEST MODE:</strong> Limited to maximum 10 hexagons to protect your Yelp API quota.
              Each hexagon uses ~3-5 API calls.
            </p>
          </div>
          
          <div className="space-y-3">
            {/* Correlation Legend */}
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-800 font-medium mb-2">🔢 Hexagon Number Correlation:</p>
              <p className="text-xs text-blue-700">
                The numbers on the map (0, 1, 2, 3...) now match the hexagon numbers in the test results below. 
                This helps you correlate what you see on the map with the Yelp data.
              </p>
            </div>
            
            {/* API Call Estimation Display */}
            {cityData && cityData.h3_grid && cityData.h3_grid.length > 0 && (
              <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded">
                <p className="text-sm text-orange-800 font-medium mb-2">📊 API Call Estimation:</p>
                <div className="text-xs text-orange-700 space-y-1">
                  <div className="flex justify-between">
                    <span>Total Hexagons:</span>
                    <span className="font-mono font-medium">{cityData.h3_grid.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimated Search Points per Hexagon:</span>
                    <span className="font-mono font-medium">3-5 points</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Test Mode (10 random hexagons):</span>
                    <span className="font-mono font-medium text-orange-600">
                      ~30 API calls
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Real Mode (all hexagons):</span>
                    <span className="font-mono font-medium text-red-600">
                      ~{cityData.h3_grid.length * 4} API calls
                    </span>
                  </div>
                  <div className="text-xs text-orange-600 mt-2 font-medium">
                    💡 Test mode now uses real Yelp API calls on 10 randomly selected hexagons
                  </div>
                </div>
              </div>
            )}
            
            {/* Test Mode Toggle */}
            <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-800 font-medium mb-1">🧪 Test Mode:</p>
                  <p className="text-xs text-purple-700">
                    {testMode 
                      ? "Real Yelp API calls on 10 random hexagons (~30 API calls)" 
                      : "Real Yelp API calls on all hexagons (~" + (cityData.h3_grid.length * 4) + " API calls)"
                    }
                  </p>
                </div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testMode}
                    onChange={() => setTestMode(!testMode)}
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm font-medium text-purple-700">
                    Test Mode
                  </span>
                </label>
              </div>
            </div>
            
            <button
              onClick={testYelpIntegration}
              disabled={yelpTesting}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
            >
              {yelpTesting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Testing Yelp Integration...</span>
                </>
              ) : (
                <>
                  <span>🍕</span>
                  <span>
                    {testMode 
                      ? "Test Coverage (No API Calls)" 
                      : "Search Yelp (Uses API Quota)"
                    }
                  </span>
                </>
              )}
            </button>
            
            <button
              onClick={getProcessingStatus}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 ml-2"
            >
              Get Status
            </button>
            
            <button
              onClick={getQuotaStatus}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 ml-2"
            >
              Get Quota
            </button>
          </div>
          
                     {/* Display Yelp test results */}
           {yelpResults && (
             <div className={`mt-4 p-4 rounded-lg border ${
               yelpResults.error 
                 ? 'bg-red-50 border-red-300' 
                 : 'bg-green-50 border-green-300'
             }`}>
               <h4 className={`font-medium mb-3 flex items-center ${
                 yelpResults.error ? 'text-red-800' : 'text-green-800'
               }`}>
                 {yelpResults.error ? '❌ Test Failed' : '✅ Test Completed Successfully'}
               </h4>
               {yelpResults.error ? (
                 <div className="text-red-700 font-medium bg-red-100 p-3 rounded border border-red-200">
                   {yelpResults.error}
                 </div>
               ) : (
                 <div className="text-sm space-y-2">
                   <div className="grid grid-cols-2 gap-4">
                     <div className="bg-white p-3 rounded border">
                       <div className="text-2xl font-bold text-green-600">{yelpResults.results?.length || 0}</div>
                       <div className="text-xs text-gray-600">Hexagons Processed</div>
                     </div>
                     <div className="bg-white p-3 rounded border">
                       <div className="text-2xl font-bold text-blue-600">{yelpResults.testMode ? 'Yes' : 'No'}</div>
                       <div className="text-xs text-gray-600">Test Mode</div>
                     </div>
                   </div>
                   <div className="text-xs text-gray-600 bg-white p-2 rounded border">
                     ⏰ Processed at: {yelpResults.processedAt}
                   </div>
                 </div>
               )}
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
       )}

       {/* PHASE 1: Hexagon Display Showcase - All Three Methods */}
       {yelpResults && yelpResults.results && yelpResults.results.length > 0 && (
         <div className="mt-8 space-y-8">
           <div className="text-center">
             <h2 className="text-2xl font-bold text-gray-800 mb-2">🎯 Hexagon Display Showcase</h2>
             <p className="text-gray-600">Compare three different ways to view your hexagon data</p>
           </div>

           {/* METHOD 1: Expandable Hexagon Cards */}
           <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200 shadow-lg">
             <h3 className="text-xl font-bold text-blue-800 mb-4 flex items-center">
               <span className="mr-2">🎴</span>
               METHOD 1: Expandable Hexagon Cards
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                               {yelpResults.results.map((result, index) => (
                  <div key={result.h3Id} className="bg-white rounded-lg border border-blue-200 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-300">
                   <div className="p-4">
                     <div className="flex items-center justify-between mb-3">
                       <span className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                         🔢 Hexagon {result.mapIndex !== undefined ? result.mapIndex : '?'}
                       </span>
                       <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(result.status)}`}>
                         {getStatusIcon(result.status)} {result.status}
                       </span>
                     </div>
                     <div className="text-center mb-3">
                       <div className="text-2xl font-bold text-blue-600">{result.totalBusinesses}</div>
                       <div className="text-sm text-gray-600">Restaurants</div>
                     </div>
                                           <button
                        onClick={() => toggleHexagonExpansion(result.h3Id)}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-all duration-200 hover:scale-105 active:scale-95 font-medium"
                      >
                        {expandedHexagons.has(result.h3Id) ? '🔽 Collapse Details' : '🔼 Expand Details'}
                      </button>
                   </div>
                   
                   {/* Expanded Content */}
                   {expandedHexagons.has(result.h3Id) && (
                     <div className="border-t border-blue-200 p-4 bg-blue-50">
                       <div className="text-sm text-gray-700 mb-3">
                         <div>Coverage: <span className="font-medium">{result.coverageQuality}</span></div>
                         {result.error && <div className="text-red-600 mt-1">Error: {result.error}</div>}
                       </div>
                                               {result.uniqueBusinesses && result.uniqueBusinesses.length > 0 ? (
                          <div className="space-y-3 max-h-60 overflow-y-auto">
                            {result.uniqueBusinesses.slice(0, 5).map((restaurant, idx) => (
                              <div key={idx} className="bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="font-semibold text-gray-800 text-sm">{restaurant.name}</div>
                                    <div className="flex items-center space-x-2 mt-1">
                                      <span className="text-yellow-600">⭐ {restaurant.rating}</span>
                                      <span className="text-green-600 font-medium">{restaurant.price}</span>
                                      <span className="text-blue-600 text-xs bg-blue-50 px-2 py-1 rounded">
                                        {restaurant.categories[0]?.title}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-600 mt-2">
                                      📍 {restaurant.location.address1}, {restaurant.location.city}
                                    </div>
                                  </div>
                                  <div className="text-right text-xs text-gray-600 ml-3">
                                    <div className="text-purple-600 font-medium">{restaurant.distance}m</div>
                                    <div className="text-gray-500">📞 {restaurant.phone}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {result.uniqueBusinesses.length > 5 && (
                              <div className="text-center text-xs text-gray-500 bg-white p-2 rounded border">
                                +{result.uniqueBusinesses.length - 5} more restaurants
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-500 text-sm text-center bg-white p-4 rounded border">No restaurants found</div>
                        )}
                     </div>
                   )}
                 </div>
               ))}
             </div>
           </div>

           {/* METHOD 2: Tabbed Interface */}
           <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200 shadow-lg">
             <h3 className="text-xl font-bold text-green-800 mb-4 flex items-center">
               <span className="mr-2">📋</span>
               METHOD 2: Tabbed Interface
             </h3>
             
                           {/* Tab Navigation */}
              <div className="flex space-x-1 mb-4 bg-white rounded-lg p-1 border border-green-200 shadow-sm">
                {(['summary', 'details', 'restaurants'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                      activeTab === tab
                        ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg transform scale-105'
                        : 'text-green-600 hover:bg-green-50 hover:scale-102'
                    }`}
                  >
                    {tab === 'summary' && '📊 Summary'}
                    {tab === 'details' && '🔍 Details'}
                    {tab === 'restaurants' && '🍕 Restaurants'}
                  </button>
                ))}
              </div>

             {/* Tab Content */}
             <div className="bg-white rounded-lg border border-green-200 p-4 min-h-48">
                               {activeTab === 'summary' && (
                  <div className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200">
                        <div className="text-3xl font-bold text-green-600">{yelpResults.processingStats?.totalHexagons || 0}</div>
                        <div className="text-sm text-green-700 font-medium">Total Hexagons</div>
                        <div className="text-xs text-green-600 mt-1">🗺️ Coverage Area</div>
                      </div>
                      <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                        <div className="text-3xl font-bold text-blue-600">{yelpResults.processingStats?.successfulHexagons || 0}</div>
                        <div className="text-sm text-blue-700 font-medium">Successful</div>
                        <div className="text-xs text-blue-600 mt-1">✅ Processed</div>
                      </div>
                      <div className="text-center p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl border border-yellow-200">
                        <div className="text-3xl font-bold text-yellow-600">{getAllRestaurants().length}</div>
                        <div className="text-sm text-yellow-700 font-medium">Total Restaurants</div>
                        <div className="text-xs text-yellow-600 mt-1">🍕 Found</div>
                      </div>
                      <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200">
                        <div className="text-3xl font-bold text-purple-600">{yelpResults.processingStats?.failedHexagons || 0}</div>
                        <div className="text-sm text-purple-700 font-medium">Failed</div>
                        <div className="text-xs text-purple-600 mt-1">❌ Issues</div>
                      </div>
                    </div>
                    
                    {/* Deduplication Statistics */}
                    {getDeduplicationStats().duplicates > 0 && (
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200 mb-4">
                        <div className="text-sm text-green-800">
                          <span className="font-medium">Deduplication:</span> Found {getDeduplicationStats().total} restaurants, 
                          removed {getDeduplicationStats().duplicates} duplicates, 
                          showing {getDeduplicationStats().unique} unique restaurants
                        </div>
                      </div>
                    )}
                    
                                         {/* Progress Bar */}
                     <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
                       <div className="flex justify-between items-center mb-3">
                         <span className="text-sm font-medium text-gray-700 flex items-center">
                           📊 Processing Progress
                         </span>
                         <span className="text-sm text-gray-600 bg-white px-3 py-1 rounded-full border">
                           {yelpResults.processingStats?.successfulHexagons || 0} / {yelpResults.processingStats?.totalHexagons || 0}
                         </span>
                       </div>
                       <div className="w-full bg-gray-200 rounded-full h-4 shadow-inner">
                         <div 
                           className="bg-gradient-to-r from-green-400 via-green-500 to-green-600 h-4 rounded-full transition-all duration-700 ease-out shadow-sm"
                           style={{ 
                             width: `${yelpResults.processingStats?.totalHexagons ? 
                               (yelpResults.processingStats.successfulHexagons / yelpResults.processingStats.totalHexagons) * 100 : 0}%` 
                           }}
                         ></div>
                       </div>
                       <div className="mt-2 text-xs text-gray-500 text-center">
                         {yelpResults.processingStats?.totalHexagons ? 
                           Math.round((yelpResults.processingStats.successfulHexagons / yelpResults.processingStats.totalHexagons) * 100) : 0}% Complete
                       </div>
                     </div>
                  </div>
                )}

               {activeTab === 'details' && (
                 <div className="space-y-3">
                   {yelpResults.results.map((result) => (
                     <div key={result.h3Id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                       <div className="flex items-center space-x-3">
                         <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(result.status)}`}>
                           {getStatusIcon(result.status)} {result.status}
                         </span>
                         <span className="font-mono text-sm text-gray-600 bg-blue-100 px-2 py-1 rounded">
                           🔢 Hexagon {result.mapIndex !== undefined ? result.mapIndex : '?'}
                         </span>
                       </div>
                       <div className="text-right">
                         <div className="font-medium text-gray-800">{result.totalBusinesses} restaurants</div>
                         <div className="text-sm text-gray-600">{result.coverageQuality} coverage</div>
                       </div>
                     </div>
                   ))}
                 </div>
               )}

                               {activeTab === 'restaurants' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-semibold text-gray-800">🍕 Restaurant Directory</h4>
                      <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                        {getAllRestaurants().length} total restaurants
                      </span>
                    </div>
                    
                    {getAllRestaurants().slice(0, 10).map((restaurant, idx) => (
                      <div key={restaurant.id || idx} className="bg-gradient-to-r from-gray-50 to-white p-4 rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h5 className="font-semibold text-gray-800 text-lg">{restaurant.name}</h5>
                              <span className="text-yellow-600 text-lg">⭐ {restaurant.rating}</span>
                              <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                                {restaurant.price}
                              </span>
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-gray-600 mb-2">
                              <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">
                                {restaurant.categories[0]?.title}
                              </span>
                              <span>📍 {restaurant.location.city}, {restaurant.location.state}</span>
                              <span>📞 {restaurant.phone}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              📍 {restaurant.location.address1}, {restaurant.location.zip_code}
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-purple-600 font-bold text-lg">{restaurant.distance}m</div>
                            <div className="text-xs text-gray-500">away</div>
                            <a 
                              href={restaurant.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-block mt-2 bg-purple-600 text-white text-xs px-3 py-1 rounded hover:bg-purple-700 transition-colors"
                            >
                              View on Yelp
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {getAllRestaurants().length > 10 && (
                      <div className="text-center bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-xl border border-purple-200">
                        <div className="text-purple-600 font-medium">+{getAllRestaurants().length - 10} more restaurants</div>
                        <div className="text-sm text-purple-500 mt-1">Scroll to see all results</div>
                      </div>
                    )}
                  </div>
                )}
             </div>
           </div>

           {/* METHOD 3: Searchable Accordion */}
           <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200 shadow-lg">
             <h3 className="text-xl font-bold text-purple-800 mb-4 flex items-center">
               <span className="mr-2">🔍</span>
               METHOD 3: Searchable Accordion
             </h3>
             
                           {/* Search Box */}
              <div className="mb-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="🔍 Search restaurants by name, category, or hexagon status..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-20 shadow-sm hover:shadow-md transition-all duration-200"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-purple-100 text-purple-600 px-3 py-1 rounded-full text-sm hover:bg-purple-200 transition-all duration-200 hover:scale-110"
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>
               <div className="mt-2 flex items-center justify-between text-sm">
                 <span className="text-gray-600">
                   {searchTerm ? 'Filtered results' : 'All hexagons'} • 
                   {yelpResults.results.filter(result => {
                     if (!searchTerm) return true;
                     const hasMatchingRestaurants = result.uniqueBusinesses?.some(restaurant => 
                       restaurant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       restaurant.categories.some(cat => cat.title.toLowerCase().includes(searchTerm.toLowerCase()))
                     );
                     return hasMatchingRestaurants || result.status.toLowerCase().includes(searchTerm.toLowerCase());
                   }).length} hexagons
                 </span>
                 {searchTerm && (
                   <span className="text-purple-600 font-medium">
                     "{searchTerm}" found in {yelpResults.results.filter(result => {
                       if (!searchTerm) return true;
                       const hasMatchingRestaurants = result.uniqueBusinesses?.some(restaurant => 
                         restaurant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         restaurant.categories.some(cat => cat.title.toLowerCase().includes(searchTerm.toLowerCase()))
                       );
                       return hasMatchingRestaurants || result.status.toLowerCase().includes(searchTerm.toLowerCase());
                     }).length} hexagons
                   </span>
                 )}
               </div>
             </div>

             {/* Accordion Sections */}
             <div className="space-y-3">
               {yelpResults.results
                 .filter(result => {
                   if (!searchTerm) return true;
                   // Filter by hexagon status or if it contains matching restaurants
                   const hasMatchingRestaurants = result.uniqueBusinesses?.some(restaurant => 
                     restaurant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     restaurant.categories.some(cat => cat.title.toLowerCase().includes(searchTerm.toLowerCase()))
                   );
                   return hasMatchingRestaurants || result.status.toLowerCase().includes(searchTerm.toLowerCase());
                 })
                 .map((result) => (
                 <div key={result.h3Id} className="bg-white rounded-lg border border-purple-200 shadow-sm">
                                        <button
                       onClick={() => toggleHexagonExpansion(result.h3Id)}
                       className="w-full p-4 text-left flex items-center justify-between hover:bg-purple-50 transition-all duration-200 hover:shadow-md"
                     >
                     <div className="flex items-center space-x-3">
                       <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(result.status)}`}>
                         {getStatusIcon(result.status)} {result.status}
                       </span>
                       <span className="font-mono text-sm text-gray-600">{result.h3Id.slice(-8)}...</span>
                       <span className="text-sm text-gray-600">({result.totalBusinesses} restaurants)</span>
                     </div>
                     <span className="text-purple-600">
                       {expandedHexagons.has(result.h3Id) ? '▼' : '▶'}
                     </span>
                   </button>
                   
                                       {/* Accordion Content */}
                    {expandedHexagons.has(result.h3Id) && (
                      <div className="border-t border-purple-200 p-4 bg-purple-50">
                        <div className="space-y-3">
                          {result.uniqueBusinesses && result.uniqueBusinesses.length > 0 ? (
                            result.uniqueBusinesses.map((restaurant, idx) => (
                              <div key={restaurant.id || idx} className="bg-white p-3 rounded-lg border border-purple-100 shadow-sm hover:shadow-md transition-all duration-200 hover:border-purple-200">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-gray-800">{restaurant.name}</div>
                                    <div className="text-sm text-gray-600">
                                      ⭐ {restaurant.rating} • {restaurant.price} • {restaurant.categories[0]?.title}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      📍 {restaurant.location.address1}, {restaurant.location.city}, {restaurant.location.state}
                                    </div>
                                  </div>
                                  <div className="text-right text-sm text-gray-600">
                                    <div className="text-purple-600 font-medium">{restaurant.distance}m away</div>
                                    <div className="text-gray-500">📞 {restaurant.phone}</div>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-500 text-sm text-center py-4">No restaurants found in this hexagon</div>
                          )}
                        </div>
                      </div>
                    )}
                 </div>
               ))}
             </div>
           </div>
         </div>
       )}
     </div>
   );
 }
