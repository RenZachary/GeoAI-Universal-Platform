/**
 * AggregateOperation - Statistical aggregation (MAX, MIN, AVG, SUM, COUNT, MEDIAN, STD_DEV, VARIANCE)
 */

import type { PlatformFeatureCollection } from '../../../../core';

export class AggregateOperation {
  async execute(
    geojson: PlatformFeatureCollection,
    aggFunc: string,
    field: string,
    returnFeature?: boolean
  ): Promise<PlatformFeatureCollection> {
    const values: number[] = [];
    let targetFeature: any = null;
    
    // Extract numeric values from features
    for (const feature of geojson.features) {
      const value = feature.properties?.[field];
      if (value !== undefined && value !== null && typeof value === 'number') {
        values.push(value);
        
        // For MAX/MIN operations that need to return the feature
        if (returnFeature && (aggFunc === 'MAX' || aggFunc === 'MIN')) {
          if (aggFunc === 'MAX' && (!targetFeature || value > (targetFeature.properties?.[field] || 0))) {
            targetFeature = feature;
          }
          if (aggFunc === 'MIN' && (!targetFeature || value < (targetFeature.properties?.[field] || Infinity))) {
            targetFeature = feature;
          }
        }
      }
    }
    
    // If returning a specific feature (for TOP_N or MAX/MIN with feature)
    if (returnFeature && targetFeature) {
      return {
        type: 'FeatureCollection',
        features: [targetFeature]
      };
    }
    
    // Calculate statistics based on aggFunc
    const stats: Record<string, any> = {};
    
    switch (aggFunc.toUpperCase()) {
      case 'COUNT':
        stats.count = values.length;
        break;
      
      case 'SUM':
        stats.sum = values.reduce((a, b) => a + b, 0);
        break;
      
      case 'AVG':
      case 'MEAN':
        stats.mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        break;
      
      case 'MIN':
        stats.min = values.length > 0 ? Math.min(...values) : null;
        break;
      
      case 'MAX':
        stats.max = values.length > 0 ? Math.max(...values) : null;
        break;
      
      case 'MEDIAN':
        stats.median = this.calculateMedian(values);
        break;
      
      case 'STD_DEV':
        stats.std_dev = this.calculateStdDev(values);
        break;
      
      case 'VARIANCE':
        stats.variance = this.calculateVariance(values);
        break;
      
      default:
        throw new Error(`Unsupported aggregation function: ${aggFunc}`);
    }
    
    // Return result as a single feature with statistics in properties
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: null,
        properties: stats
      }]
    };
  }
  
  /**
   * Calculate median value
   */
  private calculateMedian(values: number[]): number | null {
    if (values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }
  
  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[]): number | null {
    if (values.length === 0) return null;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
  
  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number | null {
    if (values.length === 0) return null;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }
}
