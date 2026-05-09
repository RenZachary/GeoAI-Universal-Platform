/**
 * AggregationOperator - Performs aggregation operations on data
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../SpatialOperator';
import { DataAccessFacade } from '../../data-access';
import { DataSourceRepository } from '../../data-access/repositories';
import type Database from 'better-sqlite3';

const AggregationInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to aggregate'),
  operation: z.enum(['MAX', 'MIN', 'AVG', 'SUM', 'COUNT', 'TOP_N']).describe('Aggregation operation'),
  field: z.string().describe('Field name to aggregate'),
  topN: z.number().min(1).optional().describe('Number of top features (for TOP_N)')
});

const AggregationOutputSchema = z.object({
  result: z.union([z.number(), z.array(z.any())]).describe('Aggregation result value or features'),
  operation: z.string().describe('Operation performed'),
  field: z.string().describe('Field aggregated')
});

export class AggregationOperator extends SpatialOperator {
  readonly operatorId = 'aggregation';
  readonly name = 'Data Aggregation';
  readonly description = 'Perform aggregation operations (MAX, MIN, AVG, SUM, COUNT, TOP_N) on numeric fields';
  readonly category = 'analysis' as const;
  
  readonly inputSchema = AggregationInputSchema;
  readonly outputSchema = AggregationOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof AggregationInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof AggregationOutputSchema>> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    const result = await dataAccess.aggregate(
      dataSource.type,
      dataSource.reference,
      params.operation,
      params.field,
      params.topN ? true : undefined  // Convert number to boolean for now
    );
    
    return {
      result: result.metadata?.value || result.metadata?.features || [],
      operation: params.operation,
      field: params.field
    };
  }
}
