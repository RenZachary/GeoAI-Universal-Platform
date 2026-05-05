/**
 * GeoJSON Statistical Operation
 * Provides statistical calculations and classification for GeoJSON data
 */

import type { GeoJSONFeatureCollection } from '../GeoJSONBasedAccessor';
import type { FieldStatistics, ClassificationMethod } from './types';

export class GeoJSONStatisticalOperation {
  
  /**
   * Extract numeric values from a specific field
   */
  extractFieldValues(geojson: GeoJSONFeatureCollection, fieldName: string): number[] {
    return geojson.features
      .map(f => f.properties?.[fieldName])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));
  }

  /**
   * Calculate comprehensive statistics for a field
   */
  calculateStatistics(geojson: GeoJSONFeatureCollection, fieldName: string): FieldStatistics {
    const values = this.extractFieldValues(geojson, fieldName);
    
    if (values.length === 0) {
      throw new Error(`No valid numeric values found for field: ${fieldName}`);
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );

    return {
      min,
      max,
      mean,
      stdDev,
      count: values.length,
      values
    };
  }

  /**
   * Classification algorithms
   */
  classify(values: number[], method: ClassificationMethod, numClasses: number): number[] {
    switch (method) {
      case 'quantile':
        return this.quantileClassification(values, numClasses);
      case 'equal_interval':
        return this.equalIntervalClassification(values, numClasses);
      case 'standard_deviation':
        return this.standardDeviationClassification(values, numClasses);
      case 'jenks':
        // TODO: Implement proper Jenks algorithm
        console.warn('Jenks not fully implemented, using quantile as fallback');
        return this.quantileClassification(values, numClasses);
      default:
        throw new Error(`Unsupported classification method: ${method}`);
    }
  }

  /**
   * Sort features by field value
   */
  sortByField(geojson: GeoJSONFeatureCollection, fieldName: string, order: 'asc' | 'desc'): GeoJSONFeatureCollection {
    return {
      ...geojson,
      features: [...geojson.features].sort((a, b) => {
        const valA = a.properties?.[fieldName] ?? 0;
        const valB = b.properties?.[fieldName] ?? 0;
        return order === 'asc' ? valA - valB : valB - valA;
      })
    };
  }

  /**
   * Quantile classification
   */
  private quantileClassification(values: number[], numClasses: number): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    const breaks: number[] = [sorted[0]];
    
    for (let i = 1; i < numClasses; i++) {
      const index = Math.floor((i / numClasses) * (sorted.length - 1));
      breaks.push(sorted[index]);
    }
    breaks.push(sorted[sorted.length - 1]);
    
    return breaks;
  }

  /**
   * Equal interval classification
   */
  private equalIntervalClassification(values: number[], numClasses: number): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const interval = (max - min) / numClasses;
    
    const breaks: number[] = [];
    for (let i = 0; i <= numClasses; i++) {
      breaks.push(min + i * interval);
    }
    
    return breaks;
  }

  /**
   * Standard deviation classification
   */
  private standardDeviationClassification(values: number[], numClasses: number): number[] {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );
    
    const breaks: number[] = [];
    const halfClasses = Math.floor(numClasses / 2);
    
    for (let i = -halfClasses; i <= halfClasses; i++) {
      breaks.push(mean + i * stdDev);
    }
    
    return breaks.sort((a, b) => a - b);
  }
}
