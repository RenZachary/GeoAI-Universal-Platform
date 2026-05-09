/**
 * StatisticsCalculatorOperator - Calculates statistical summaries
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../SpatialOperator';
import { DataAccessFacade } from '../../data-access';
import { DataSourceRepository } from '../../data-access/repositories';
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
    
    // Calculate statistics using PostGIS backend
    const postGISBackend = dataAccess.getPostGISBackend();
    if (!postGISBackend) {
      throw new Error('PostGIS backend not configured');
    }
    
    // Build SQL query for requested statistics
    const stats = params.statistics || ['count', 'min', 'max', 'avg', 'sum'];
    const statExpressions = stats.map((stat: string) => {
      switch (stat.toLowerCase()) {
        case 'count': return 'COUNT(*) as count';
        case 'min': return `MIN("${params.fieldName}") as min`;
        case 'max': return `MAX("${params.fieldName}") as max`;
        case 'avg': return `AVG("${params.fieldName}") as avg`;
        case 'sum': return `SUM("${params.fieldName}") as sum`;
        default: return null;
      }
    }).filter(Boolean);
    
    const query = `SELECT ${statExpressions.join(', ')} FROM ${dataSource.reference}`;
    
    try {
      const result = await (postGISBackend as any).executeRaw(query);
      const row = result.rows[0];
      
      return {
        result: row,
        count: parseInt(row.count) || 0,
        fieldName: params.fieldName
      };
    } catch (error) {
      console.error('[StatisticsCalculatorOperator] Failed to calculate statistics:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Statistics calculation failed: ${message}`);
    }
  }
}
