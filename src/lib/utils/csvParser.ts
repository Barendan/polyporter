// CSV parser and utilities for restaurant imports/exports
import Papa from 'papaparse';
import type { YelpBusiness } from '@/lib/yelp/search';

// ============================================================================
// CSV EXPORT UTILITIES
// ============================================================================

/**
 * Escape a value for CSV format
 * Handles commas, quotes, and newlines according to RFC 4180
 * 
 * @param value - The string value to escape
 * @returns The escaped CSV value
 */
export function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate CSV content from headers and rows
 * 
 * @param headers - Array of header strings
 * @param rows - Array of row arrays (each row is an array of string values)
 * @returns Complete CSV content string
 */
export function generateCsvContent(headers: string[], rows: string[][]): string {
  return [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ].join('\n');
}

/**
 * Trigger a CSV file download in the browser
 * 
 * @param content - The CSV content string
 * @param filename - The filename for the download (without extension)
 */
export function downloadCsv(content: string, filename: string): void {
  const dataBlob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// CSV IMPORT UTILITIES
// ============================================================================

export interface ParsedRestaurant {
  Name: string;
  Latitude: string;
  Longitude: string;
  City: string;
  State: string;
  Rating: string;
  Address: string;
  'Zip Code': string;
  Phone: string;
  Price: string;
  Category: string;
  'Review Count': string;
}

export interface ParseResult {
  restaurants: YelpBusiness[];
  errors: string[];
  totalRows: number;
}

/**
 * Parse CSV file and transform to YelpBusiness format
 * Handles missing fields (id, url, distance, categories array)
 */
export function parseRestaurantCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<ParsedRestaurant>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => {
        // Clean headers by replacing tabs with spaces and trimming
        // This fixes issues where headers like "Latitude\tLongitude" become unparseable
        return header.replace(/\t/g, ' ').trim();
      },
      complete: (results) => {
        try {
          const restaurants: YelpBusiness[] = [];
          const errors: string[] = [];

          results.data.forEach((row, index) => {
            try {
              // Validate required fields
              if (!row.Name || !row.Latitude || !row.Longitude) {
                errors.push(`Row ${index + 2}: Missing required field (Name, Latitude, Longitude)`);
                return;
              }

              // Parse coordinates
              const lat = parseFloat(row.Latitude);
              const lng = parseFloat(row.Longitude);

              if (isNaN(lat) || isNaN(lng)) {
                errors.push(`Row ${index + 2}: Invalid coordinates (${row.Latitude}, ${row.Longitude})`);
                return;
              }

              if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                errors.push(`Row ${index + 2}: Coordinates out of range (lat: ${lat}, lng: ${lng})`);
                return;
              }

              // Transform Category → categories array
              const category = row.Category?.trim() || 'restaurant';
              const categories = [{
                alias: category.toLowerCase().replace(/\s+/g, '-'),
                title: category.charAt(0).toUpperCase() + category.slice(1)
              }];

              // Parse numeric fields
              const rating = parseFloat(row.Rating) || 0;
              const reviewCount = parseInt(row['Review Count']) || 0;

              // Build YelpBusiness object
              const restaurant: YelpBusiness = {
                id: `manual-import-${index}-${Date.now()}`, // Temporary ID for frontend state (replaced on DB save)
                name: row.Name?.trim() || '',
                rating,
                review_count: reviewCount,
                price: row.Price?.trim() || '',
                categories,
                coordinates: { latitude: lat, longitude: lng },
                location: {
                  address1: row.Address?.trim() || '',
                  city: row.City?.trim() || '',
                  state: row.State?.trim() || '',
                  zip_code: row['Zip Code']?.trim() || ''
                },
                phone: row.Phone?.trim() || '',
                url: '', // Empty for manual imports
                distance: 0 // Default for manual imports
              };

              restaurants.push(restaurant);

            } catch (error) {
              errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          });

          resolve({
            restaurants,
            errors,
            totalRows: results.data.length
          });

        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      }
    });
  });
}
