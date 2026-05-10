/**
 * PostGISStatisticalOperation - SQL-based field statistics
 */

import type { Pool } from 'pg';

export interface FieldStatistics {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  count: number;
  values: number[];
}

export class PostGISStatisticalOperation {
  private pool: Pool;
  private schema: string;
  
  constructor(pool: Pool, schema: string = 'public') {
    this.pool = pool;
    this.schema = schema;
  }
  
  async getUniqueValues(tableName: string, fieldName: string): Promise<string[]> {
    // Parse table reference
    let sourceSchema: string;
    let sourceTable: string;
    
    if (tableName.includes('.')) {
      const parts = tableName.split('.');
      sourceSchema = parts[0];
      sourceTable = parts[1];
    } else {
      sourceSchema = this.schema;
      sourceTable = tableName;
    }
    
    try {
      const result = await this.pool.query(`
        SELECT DISTINCT ${fieldName}
        FROM ${sourceSchema}.${sourceTable}
        WHERE ${fieldName} IS NOT NULL
        ORDER BY ${fieldName}
      `);
      
      return result.rows.map(row => String(row[fieldName]));
    } catch (error) {
      console.error(`[PostGISStatisticalOperation] Failed to get unique values for ${fieldName}:`, error);
      throw error;
    }
  }
  
  async getFieldStatistics(tableName: string, fieldName: string): Promise<FieldStatistics> {
    // Parse table reference
    let sourceSchema: string;
    let sourceTable: string;
    
    if (tableName.includes('.')) {
      const parts = tableName.split('.');
      sourceSchema = parts[0];
      sourceTable = parts[1];
    } else {
      sourceSchema = this.schema;
      sourceTable = tableName;
    }
    
    try {
      const result = await this.pool.query(`
        SELECT 
          MIN(${fieldName}) as min,
          MAX(${fieldName}) as max,
          AVG(${fieldName}) as mean,
          STDDEV(${fieldName}) as stddev,
          COUNT(${fieldName}) as count
        FROM ${sourceSchema}.${sourceTable}
        WHERE ${fieldName} IS NOT NULL
      `);
      
      const row = result.rows[0];
      
      return {
        min: parseFloat(row.min) || 0,
        max: parseFloat(row.max) || 0,
        mean: parseFloat(row.mean) || 0,
        stdDev: parseFloat(row.stddev) || 0,
        count: parseInt(row.count) || 0,
        values: [] // Full values not retrieved for performance
      };
    } catch (error) {
      console.error(`[PostGISStatisticalOperation] Failed to get statistics for ${fieldName}:`, error);
      throw error;
    }
  }
  
  async getClassificationBreaks(
    tableName: string,
    fieldName: string,
    method: 'quantile' | 'equal_interval' | 'jenks' | 'standard_deviation',
    numClasses: number = 5
  ): Promise<number[]> {
    // Parse table reference
    let sourceSchema: string;
    let sourceTable: string;
    
    if (tableName.includes('.')) {
      const parts = tableName.split('.');
      sourceSchema = parts[0];
      sourceTable = parts[1];
    } else {
      sourceSchema = this.schema;
      sourceTable = tableName;
    }
    
    const stats = await this.getFieldStatistics(tableName, fieldName);
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
        
      case 'quantile':
        // Use percentile-based breaks
        for (let i = 0; i <= numClasses; i++) {
          const percentile = (i / numClasses) * 100;
          const result = await this.pool.query(`
            SELECT PERCENTILE_CONT($1) WITHIN GROUP (ORDER BY ${fieldName}) as value
            FROM ${sourceSchema}.${sourceTable}
            WHERE ${fieldName} IS NOT NULL
          `, [percentile / 100]);
          breaks.push(parseFloat(result.rows[0].value));
        }
        break;
        
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
        
      case 'jenks':
        // Simplified Jenks - use quantile as approximation
        // Full Jenks implementation requires iterative optimization
        console.warn('[PostGISStatisticalOperation] Jenks classification uses quantile approximation');
        for (let i = 0; i <= numClasses; i++) {
          const percentile = (i / numClasses) * 100;
          const result = await this.pool.query(`
            SELECT PERCENTILE_CONT($1) WITHIN GROUP (ORDER BY ${fieldName}) as value
            FROM ${sourceSchema}.${sourceTable}
            WHERE ${fieldName} IS NOT NULL
          `, [percentile / 100]);
          breaks.push(parseFloat(result.rows[0].value));
        }
        break;
        
      default:
        throw new Error(`Unsupported classification method: ${method}`);
    }
    
    return breaks;
  }
}
