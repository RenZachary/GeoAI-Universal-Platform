/**
 * PostGIS Statistical Operation
 * Provides statistical calculations and classification for PostGIS data
 */

import type { Pool } from 'pg';
import type { FieldStatistics, ClassificationMethod } from '../../geojson/operations/types';

export class PostGISStatisticalOperation {
  constructor(private pool: Pool, private schema: string) {}

  /**
   * Extract field values via SQL query
   */
  async extractFieldValues(tableName: string, fieldName: string): Promise<number[]> {
    const result = await this.pool.query(`
      SELECT ${fieldName} 
      FROM ${this.schema}.${tableName}
      WHERE ${fieldName} IS NOT NULL
      ORDER BY ${fieldName} ASC
    `);
    
    return result.rows.map(row => row[fieldName]);
  }

  /**
   * Calculate statistics using SQL aggregation (more efficient for large datasets)
   */
  async calculateStatistics(tableName: string, fieldName: string): Promise<FieldStatistics> {
    // Get aggregate statistics via SQL
    const aggResult = await this.pool.query(`
      SELECT 
        MIN(${fieldName}) as min,
        MAX(${fieldName}) as max,
        AVG(${fieldName}) as mean,
        STDDEV(${fieldName}) as "stdDev",
        COUNT(${fieldName}) as count
      FROM ${this.schema}.${tableName}
      WHERE ${fieldName} IS NOT NULL
    `);

    const stats = aggResult.rows[0];

    // Fetch all values for classification (could be optimized with sampling for huge tables)
    const valuesResult = await this.pool.query(`
      SELECT ${fieldName}
      FROM ${this.schema}.${tableName}
      WHERE ${fieldName} IS NOT NULL
      ORDER BY ${fieldName} ASC
    `);

    const values = valuesResult.rows.map(row => row[fieldName]);

    return {
      min: parseFloat(stats.min),
      max: parseFloat(stats.max),
      mean: parseFloat(stats.mean),
      stdDev: parseFloat(stats.stdDev) || 0,
      count: parseInt(stats.count),
      values
    };
  }

  /**
   * Classification - uses same algorithms as GeoJSON
   * TODO: Optimize with SQL-based classification for large datasets
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
        console.warn('Jenks not fully implemented, using quantile as fallback');
        return this.quantileClassification(values, numClasses);
      default:
        throw new Error(`Unsupported classification method: ${method}`);
    }
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
