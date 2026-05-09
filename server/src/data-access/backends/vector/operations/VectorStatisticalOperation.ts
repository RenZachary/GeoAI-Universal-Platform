/**
 * VectorStatisticalOperation - JavaScript-based field statistics for GeoJSON data
 */

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    properties?: Record<string, any>;
  }>;
}

export interface FieldStatistics {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  variance: number;
  median: number;
  count: number;
  sum: number;
}

export class VectorStatisticalOperation {
  /**
   * Extract numeric values from GeoJSON features
   */
  private extractValues(geojson: GeoJSONFeatureCollection, fieldName: string): number[] {
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
   * Get unique string values from a field (for categorical data)
   */
  getUniqueValues(geojson: GeoJSONFeatureCollection, fieldName: string): string[] {
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
  getFieldStatistics(geojson: GeoJSONFeatureCollection, fieldName: string): FieldStatistics {
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
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Variance and standard deviation
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);
    
    // Median
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
    
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
   * Calculate classification breaks for choropleth mapping
   */
  getClassificationBreaks(
    geojson: GeoJSONFeatureCollection,
    fieldName: string,
    method: 'quantile' | 'equal_interval' | 'jenks' | 'standard_deviation',
    numClasses: number = 5
  ): number[] {
    const stats = this.getFieldStatistics(geojson, fieldName);
    const values = this.extractValues(geojson, fieldName);
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
        const sorted = [...values].sort((a, b) => a - b);
        for (let i = 0; i <= numClasses; i++) {
          const percentile = i / numClasses;
          const index = Math.floor(percentile * (sorted.length - 1));
          breaks.push(sorted[index]);
        }
        break;
      }
        
      case 'standard_deviation': {
        // Breaks at standard deviation intervals from mean
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
        // Simplified Jenks Natural Breaks using quantile as approximation
        // Full Jenks implementation requires iterative optimization algorithm
        console.warn('[VectorStatisticalOperation] Jenks classification uses quantile approximation');
        const sorted = [...values].sort((a, b) => a - b);
        for (let i = 0; i <= numClasses; i++) {
          const percentile = i / numClasses;
          const index = Math.floor(percentile * (sorted.length - 1));
          breaks.push(sorted[index]);
        }
        break;
      }
        
      default:
        throw new Error(`Unsupported classification method: ${method}`);
    }
    
    return breaks;
  }
}
