/**
 * VectorStatisticalOperation - JavaScript-based field statistics for GeoJSON data
 */

import type { PlatformFeatureCollection } from '../../../../core';
import type { FieldStatistics as BaseFieldStatistics } from '../../../interfaces';

// Extend base FieldStatistics with additional computed fields
export interface ExtendedFieldStatistics extends BaseFieldStatistics {
  variance: number;
  median: number;
}

export class VectorStatisticalOperation {
  /**
   * Extract numeric values from GeoJSON features
   */
  private extractValues(geojson: PlatformFeatureCollection, fieldName: string): number[] {
    const values: number[] = [];
    
    for (const feature of geojson.features) {
      const value = feature.properties?.[fieldName];
      if (value !== undefined && value !== null && typeof value === 'number') {
        values.push(value);
      }
    }
    
    return values;
  }
  
  /**
   * Get unique string values from a field
   */
  getUniqueValues(geojson: PlatformFeatureCollection, fieldName: string): string[] {
    const values = new Set<string>();
    
    for (const feature of geojson.features) {
      const value = feature.properties?.[fieldName];
      if (value !== undefined && value !== null) {
        values.add(String(value));
      }
    }
    
    return Array.from(values).sort();
  }
  
  /**
   * Calculate comprehensive field statistics
   */
  getFieldStatistics(geojson: PlatformFeatureCollection, fieldName: string): ExtendedFieldStatistics {
    const values = this.extractValues(geojson, fieldName);
    
    if (values.length === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        stdDev: 0,
        variance: 0,
        median: 0,
        count: 0,
        sum: 0
      };
    }
    
    // Basic statistics
    const count = values.length;
    const sum = values.reduce((acc, val) => acc + val, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = sum / count;
    
    // Median calculation
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
    
    // Variance and standard deviation
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / count;
    const stdDev = Math.sqrt(variance);
    
    return {
      min,
      max,
      mean,
      stdDev,
      variance,
      median,
      count,
      sum
    };
  }
  
  /**
   * Calculate classification breaks for choropleth maps
   */
  getClassificationBreaks(
    geojson: PlatformFeatureCollection,
    fieldName: string,
    method: 'quantile' | 'equal_interval' | 'jenks' | 'standard_deviation',
    numClasses: number = 5
  ): number[] {
    const stats = this.getFieldStatistics(geojson, fieldName);
    const values = this.extractValues(geojson, fieldName).sort((a, b) => a - b);
    const breaks: number[] = [];
    
    switch (method) {
      case 'equal_interval': {
        // Divide range into equal intervals
        const range = stats.max - stats.min;
        const interval = range / numClasses;
        for (let i = 0; i <= numClasses; i++) {
          breaks.push(stats.min + (i * interval));
        }
        break;
      }
        
      case 'quantile': {
        // Use percentile-based breaks
        for (let i = 0; i <= numClasses; i++) {
          const percentileIndex = Math.floor((i / numClasses) * (values.length - 1));
          breaks.push(values[percentileIndex]);
        }
        break;
      }
        
      case 'standard_deviation': {
        // Breaks at standard deviation intervals
        const mean = stats.mean;
        const stdDev = stats.stdDev;
        breaks.push(mean - (2 * stdDev));
        breaks.push(mean - stdDev);
        breaks.push(mean);
        breaks.push(mean + stdDev);
        breaks.push(mean + (2 * stdDev));
        break;
      }
        
      case 'jenks': {
        // Simplified Jenks - use quantile as approximation
        // Full Jenks implementation requires iterative optimization
        console.warn('[VectorStatisticalOperation] Jenks classification uses quantile approximation');
        for (let i = 0; i <= numClasses; i++) {
          const percentileIndex = Math.floor((i / numClasses) * (values.length - 1));
          breaks.push(values[percentileIndex]);
        }
        break;
      }
        
      default:
        throw new Error(`Unsupported classification method: ${method}`);
    }
    
    return breaks;
  }
}
