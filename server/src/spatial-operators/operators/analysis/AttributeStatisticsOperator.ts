/**
 * AttributeStatisticsOperator - Calculates statistical summaries for data attributes
 * 
 * Provides descriptive statistics (mean, median, std_dev, variance, min, max, sum, count)
 * for numeric fields in vector datasets. Works with both file-based (GeoJSON/Shapefile)
 * and PostGIS data sources through the DataAccessFacade.
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, AnalyticalOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';

// ========== Input Schema ==========

const StatisticType = z.enum([
  'mean',
  'median',
  'std_dev',
  'variance',
  'min',
  'max',
  'sum',
  'count'
]);

export const AttributeStatisticsInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to analyze'),
  fieldName: z.string().describe('Field name to calculate statistics for (must be numeric)'),
  statistics: z.array(StatisticType)
    .default(['mean', 'median', 'std_dev', 'min', 'max'])
    .describe('List of statistics to calculate')
});

// ========== Output Schema ==========

export const AttributeStatisticsOutputSchema = AnalyticalOutputSchema.extend({
  data: z.object({
    statistics: z.record(StatisticType, z.number()).describe('Calculated statistics keyed by statistic type'),
    count: z.number().describe('Total number of features analyzed'),
    fieldName: z.string().describe('Field that was analyzed'),
    dataSourceId: z.string().describe('Source data source ID')
  })
});

// ========== Operator Implementation ==========

export class AttributeStatisticsOperator extends SpatialOperator {
  readonly operatorId = 'attribute_statistics';
  readonly name = 'Attribute Statistics Calculator';
  readonly description = 'Calculate descriptive statistics (mean, median, standard deviation, variance, min, max, sum, count) for numeric fields in vector datasets. ';
  readonly category = 'analysis' as const;
  readonly returnType = 'analytical' as const; // Returns statistics, not spatial data
  
  readonly inputSchema = AttributeStatisticsInputSchema;
  readonly outputSchema = AttributeStatisticsOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof AttributeStatisticsInputSchema>,
    _context: OperatorContext
  ): Promise<z.infer<typeof AttributeStatisticsOutputSchema>> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    // Calculate statistics for each requested type using DataAccessFacade
    const result: Record<string, number> = {};
    let count = 0;
    
    for (const stat of params.statistics) {
      try {
        // Map statistics to aggregate functions
        const aggFunc = this.mapStatisticToAggFunc(stat);
        
        // Use DataAccessFacade.aggregate() - works for all backend types
        const nativeData = await dataAccess.aggregate(
          dataSource.type,
          dataSource.reference,
          aggFunc,
          params.fieldName,
          false // Don't return feature, just the value
        );
        
        // Extract value from result
        const value = this.extractStatValue(nativeData, stat);
        if (value !== null && value !== undefined) {
          result[stat] = value;
        }
        
        // Get count from first calculation
        if (count === 0 && stat === 'count') {
          count = value || 0;
        }
      } catch (error) {
        console.warn(`[AttributeStatisticsOperator] Failed to calculate ${stat}:`, error);
        // Continue with other statistics even if one fails
      }
    }
    
    // If count wasn't calculated, get it separately
    if (count === 0) {
      try {
        const countData = await dataAccess.aggregate(
          dataSource.type,
          dataSource.reference,
          'COUNT',
          params.fieldName,
          false
        );
        count = this.extractStatValue(countData, 'count') || 0;
      } catch (error) {
        console.warn('[AttributeStatisticsOperator] Failed to get count:', error);
      }
    }
    
    // Return analytical result structure (NOT NativeData)
    return {
      success: true,
      data: {
        statistics: result,
        count: count,
        fieldName: params.fieldName,
        dataSourceId: params.dataSourceId
      },
      metadata: {
        operatorId: this.operatorId,
        executedAt: new Date().toISOString(),
        summary: `Calculated ${params.statistics.length} statistics for field "${params.fieldName}" across ${count} features`
      }
    };
  }
  
  /**
   * Map statistic name to aggregate function
   */
  private mapStatisticToAggFunc(stat: string): string {
    const mapping: Record<string, string> = {
      'mean': 'AVG',
      'median': 'MEDIAN',
      'std_dev': 'STD_DEV',
      'variance': 'VARIANCE',
      'min': 'MIN',
      'max': 'MAX',
      'sum': 'SUM',
      'count': 'COUNT'
    };
    
    return mapping[stat] || stat.toUpperCase();
  }
  
  /**
   * Extract statistic value from NativeData result
   */
  private extractStatValue(nativeData: any, stat: string): number | null {
    try {
      // Result is stored in metadata or as a feature property
      const props = nativeData?.metadata?.result?.features?.[0]?.properties;
      
      if (!props) {
        return null;
      }
      
      // Map stat names to property keys
      const keyMap: Record<string, string> = {
        'mean': 'mean',
        'median': 'median',
        'std_dev': 'std_dev',
        'variance': 'variance',
        'min': 'min',
        'max': 'max',
        'sum': 'sum',
        'count': 'count'
      };
      
      const key = keyMap[stat] || stat;
      const value = props[key];
      
      return typeof value === 'number' ? value : null;
    } catch (error) {
      console.warn(`[AttributeStatisticsOperator] Failed to extract ${stat} value:`, error);
      return null;
    }
  }
}
