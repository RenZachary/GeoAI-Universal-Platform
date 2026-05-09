/**
 * StatisticsCalculatorOperator - Calculates statistical summaries
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../SpatialOperator';
import { DataAccessorFactory } from '../../data-access';
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
    const accessorFactory = new DataAccessorFactory(this.workspaceBase);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    const accessor = accessorFactory.createAccessor(dataSource.type);
    
    const result = await accessor.statistics(dataSource.reference, {
      fieldName: params.fieldName,
      statistics: params.statistics
    });
    
    return {
      result: result.metadata?.statistics || {},
      count: result.metadata?.count || 0,
      fieldName: params.fieldName
    };
  }
}
