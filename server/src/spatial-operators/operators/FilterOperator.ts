/**
 * FilterOperator - Filters data based on attribute or spatial conditions
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../SpatialOperator';
import type { FilterCondition } from '../../../data-access/interfaces';
import { DataAccessorFactory } from '../../data-access';
import { DataSourceRepository } from '../../data-access/repositories';
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

const FilterOutputSchema = z.object({
  result: z.number().describe('Number of features after filtering'),
  originalCount: z.number().describe('Original feature count'),
  filteredCount: z.number().describe('Feature count after filtering')
});

export class FilterOperator extends SpatialOperator {
  readonly operatorId = 'filter';
  readonly name = 'Data Filter';
  readonly description = 'Filter data sources based on attribute conditions or spatial relationships';
  readonly category = 'analysis' as const;
  
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
    const accessorFactory = new DataAccessorFactory(this.workspaceBase);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    const accessor = accessorFactory.createAccessor(dataSource.type);
    
    const conditions = Array.isArray(params.conditions) ? params.conditions : [params.conditions];
    
    const result = await accessor.filter(
      dataSource.reference,
      conditions as FilterCondition[]
    );
    
    return {
      result: result.metadata?.featureCount || 0,
      originalCount: result.metadata?.originalCount || 0,
      filteredCount: result.metadata?.featureCount || 0
    };
  }
}
