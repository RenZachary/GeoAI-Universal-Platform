/**
 * AggregationOperator - Performs aggregation operations on data
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const AggregationInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to aggregate'),
  operation: z.enum(['MAX', 'MIN', 'AVG', 'SUM', 'COUNT', 'TOP_N']).describe('Aggregation operation'),
  field: z.string().describe('Field name to aggregate'),
  topN: z.number().min(1).optional().describe('Number of top features (for TOP_N)')
});

// Output schema - Aggregation can return either scalar values or feature arrays
// For TOP_N, returns features (spatial); for others, returns statistics (analytical)
const AggregationOutputSchema = z.object({
  success: z.boolean().default(true),
  data: z.union([
    z.object({
      type: z.literal('scalar'),
      value: z.number(),
      operation: z.string(),
      field: z.string()
    }),
    z.object({
      type: z.literal('features'),
      features: z.array(z.any()),
      count: z.number(),
      operation: z.string(),
      field: z.string()
    })
  ]),
  metadata: z.object({
    operatorId: z.string(),
    executedAt: z.string()
  }).optional()
});

export class AggregationOperator extends SpatialOperator {
  readonly operatorId = 'aggregation';
  readonly name = 'Data Aggregation';
  readonly description = 'Perform aggregation operations (MAX, MIN, AVG, SUM, COUNT, TOP_N) on numeric fields';
  readonly category = 'analysis' as const;
  // Note: returnType depends on operation - TOP_N returns spatial, others return analytical
  // For simplicity, we mark as analytical since most operations return scalar values
  readonly returnType = 'analytical' as const;
  
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
    const resultPersistence = new ResultPersistenceService(this.db);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    // Determine if we should return features (for TOP_N operation)
    const shouldReturnFeatures = params.operation === 'TOP_N';
    
    const result = await dataAccess.aggregate(
      dataSource.type,
      dataSource.reference,
      params.operation,
      params.field,
      shouldReturnFeatures
    );
    
    // Persist result to database (registers temp table if PostGIS)
    const persistedResult = await resultPersistence.persistResult(
      result,
      'aggregation',
      dataSource,
      { operation: params.operation, field: params.field }
    );
    
    console.log('[AggregationOperator] Aggregation completed:', {
      operation: params.operation,
      field: params.field,
      hasFeatures: !!persistedResult.metadata?.features
    });
    
    // Return analytical result structure
    const isTopN = params.operation === 'TOP_N';
    
    return {
      success: true,
      data: isTopN ? {
        type: 'features' as const,
        features: persistedResult.metadata?.features || [],
        count: persistedResult.metadata?.featureCount || 0,
        operation: params.operation,
        field: params.field
      } : {
        type: 'scalar' as const,
        value: persistedResult.metadata?.value || 0,
        operation: params.operation,
        field: params.field
      },
      metadata: {
        operatorId: this.operatorId,
        executedAt: new Date().toISOString()
      }
    };
  }
}
