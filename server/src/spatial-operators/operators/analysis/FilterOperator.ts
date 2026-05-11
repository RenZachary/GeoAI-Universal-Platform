/**
 * FilterOperator - Filters data based on attribute or spatial conditions
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, SpatialOutputSchema } from '../../SpatialOperator';
import type { FilterCondition } from '../../../data-access';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const FilterInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to filter'),
  conditions: z.union([
    z.object({
      field: z.string(),
      operator: z.string(),
      value: z.any(),
      connector: z.string().optional()
    }),
    z.array(z.object({
      field: z.string(),
      operator: z.string(),
      value: z.any(),
      connector: z.string().optional()
    }))
  ]).describe('Filter conditions')
});

// Output schema extends SpatialOutputSchema - Filter produces new spatial data
const FilterOutputSchema = SpatialOutputSchema.extend({
  metadata: z.object({
    originalCount: z.number().describe('Original feature count before filtering'),
    filteredCount: z.number().describe('Feature count after filtering'),
    conditions: z.any().describe('Filter conditions applied')
  }).optional()
});

export class FilterOperator extends SpatialOperator {
  readonly operatorId = 'filter';
  readonly name = 'Data Filter';
  readonly description = 'Filter data sources based on attribute conditions or spatial relationships';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const; // Produces new spatial data
  
  readonly inputSchema = FilterInputSchema;
  readonly outputSchema = FilterOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof FilterInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof FilterOutputSchema>> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }
    
    console.log('[FilterOperator] Starting filter operation...');
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    const resultPersistence = new ResultPersistenceService(this.db);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    const conditions = Array.isArray(params.conditions) ? params.conditions : [params.conditions];
    
    // Note: DataAccessFacade.filter currently supports single condition only
    // Multi-condition support requires Backend enhancement (AND/OR logic)
    // Using first condition for now
    const result = await dataAccess.filter(
      dataSource.type,
      dataSource.reference,
      conditions[0] as FilterCondition
    );
    
    // Persist result to database (registers temp table)
    const persistedResult = await resultPersistence.persistResult(
      result,
      'filter',
      dataSource,
      { conditions: params.conditions }
    );
    
    console.log('[FilterOperator] Filter completed successfully:', {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      originalCount: persistedResult.metadata?.originalCount,
      filteredCount: persistedResult.metadata?.featureCount
    });
    
    // Return NativeData structure for chaining
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: {
        ...persistedResult.metadata,
        originalCount: persistedResult.metadata?.originalCount || 0,
        filteredCount: persistedResult.metadata?.featureCount || 0,
        conditions: params.conditions
      }
    };
  }
}
