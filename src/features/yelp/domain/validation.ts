// Data validation for Yelp business objects before saving to staging
import type { YelpBusiness } from './search';

export interface ValidationContext {
  h3Id: string;
  cityId: string;
  importLogId: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a Yelp business object to ensure all required fields are present and valid
 * Returns validation result with list of errors if invalid
 */
export function validateYelpBusiness(
  business: YelpBusiness,
  context: ValidationContext
): ValidationResult {
  const errors: string[] = [];

  // Validate ID
  if (!business.id) {
    errors.push('Missing required field: id');
  } else if (typeof business.id !== 'string' || business.id.trim().length === 0) {
    errors.push(`Invalid field: id (must be non-empty string, got: ${JSON.stringify(business.id)})`);
  }

  // Validate name
  if (!business.name) {
    errors.push('Missing required field: name');
  } else if (typeof business.name !== 'string' || business.name.trim().length === 0) {
    errors.push(`Invalid field: name (must be non-empty string, got: ${JSON.stringify(business.name)})`);
  }

  // Validate coordinates
  if (!business.coordinates) {
    errors.push('Missing required field: coordinates');
  } else {
    if (typeof business.coordinates.latitude !== 'number' || isNaN(business.coordinates.latitude)) {
      errors.push(
        `Invalid coordinates.latitude: ${JSON.stringify(business.coordinates.latitude)} (must be number between -90 and 90)`
      );
    } else if (business.coordinates.latitude < -90 || business.coordinates.latitude > 90) {
      errors.push(
        `Invalid coordinates.latitude: ${business.coordinates.latitude} (must be between -90 and 90)`
      );
    }

    if (typeof business.coordinates.longitude !== 'number' || isNaN(business.coordinates.longitude)) {
      errors.push(
        `Invalid coordinates.longitude: ${JSON.stringify(business.coordinates.longitude)} (must be number between -180 and 180)`
      );
    } else if (business.coordinates.longitude < -180 || business.coordinates.longitude > 180) {
      errors.push(
        `Invalid coordinates.longitude: ${business.coordinates.longitude} (must be between -180 and 180)`
      );
    }
  }

  // Validate location
  if (!business.location) {
    errors.push('Missing required field: location');
  } else {
    if (!business.location.city) {
      errors.push('Missing required field: location.city');
    } else if (typeof business.location.city !== 'string' || business.location.city.trim().length === 0) {
      errors.push(
        `Invalid field: location.city (must be non-empty string, got: ${JSON.stringify(business.location.city)})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Log validation error with clear formatting including stars
 */
export function logValidationError(
  business: YelpBusiness,
  context: ValidationContext,
  errors: string[]
): void {
  const stars = '⭐'.repeat(50);
  
  console.error('\n' + stars);
  console.error('❌ DATA VALIDATION ERROR');
  console.error(stars);
  console.error('');
  console.error('Request Context:');
  console.error(`  - Hexagon ID: ${context.h3Id}`);
  console.error(`  - City ID: ${context.cityId}`);
  console.error(`  - Import Log: ${context.importLogId}`);
  console.error(`  - Business Yelp ID: ${business.id || 'MISSING'}`);
  console.error('');
  console.error('Validation Errors:');
  errors.forEach((error, index) => {
    console.error(`  ${index + 1}. ${error}`);
  });
  console.error('');
  console.error('Business Data (partial):');
  console.error(JSON.stringify({
    id: business.id,
    name: business.name,
    rating: business.rating,
    coordinates: business.coordinates,
    location: business.location ? {
      city: business.location.city,
      state: business.location.state
    } : undefined
  }, null, 2));
  console.error('');
  console.error(stars + '\n');
}

