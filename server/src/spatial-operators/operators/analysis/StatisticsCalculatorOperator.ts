/**
 * StatisticsCalculatorOperator - Calculates statistical summaries
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';

const StatisticsInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source'),
  fieldName: z.string().describe('Field name to calculate statistics for'),
  statistics: z.array(z.enum(['mean', 'median', 'std_dev', 'variance', 'min', 'max', 'sum', 'count']))
    .default(['mean', 'median', 'std_dev', 'min', 'max'])
    .describe('Statistics to calculate')
});

const StatisticsOutputSchema = z.object({
  result: z.record(z.string(), z.number()).describe('Statistics object'),
  count: z.number().describe('Feature count'),
  fieldName: z.string().describe('Field analyzed')
});

export class StatisticsCalculatorOperator extends SpatialOperator {
  readonly operatorId = 'statistics_calculator';
  readonly name = 'Statistics Calculator';
  readonly description = 'Calculate statistical summaries (mean, median, std dev, etc.) for data attributes';
  readonly category = 'analysis' as const;
  
  readonly inputSchema = StatisticsInputSchema;
  readonly outputSchema = StatisticsOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof StatisticsInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof StatisticsOutputSchema>> {
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
        console.warn(`[StatisticsCalculatorOperator] Failed to calculate ${stat}:`, error);
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
        console.warn('[StatisticsCalculatorOperator] Failed to get count:', error);
      }
    }
    
    return {
      result,
      count,
      fieldName: params.fieldName
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
      console.warn(`[StatisticsCalculatorOperator] Failed to extract ${stat} value:`, error);
      return null;
    }
  }
}
