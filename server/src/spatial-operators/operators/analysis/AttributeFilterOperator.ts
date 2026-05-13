/**
 * AttributeFilterOperator - Filters data based on attribute conditions
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, SpatialOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const FilterOperatorEnum = z.enum([
  'equals',
  'not_equals', 
  'greater_than',
  'less_than',
  'greater_equal',
  'less_equal',
  'contains',
  'starts_with',
  'ends_with',
  'in',
  'between',
  'is_null',
  'is_not_null'
]);

const AttributeFilterInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to filter'),
  field: z.string().describe('Field name to filter on'),
  operator: FilterOperatorEnum.describe('Filter operator'),
  value: z.any().describe('Value to compare against')
});

export class AttributeFilterOperator extends SpatialOperator {
  readonly operatorId = 'attribute_filter';
  readonly name = 'Attribute Filter';
  readonly description = 'Filter features from a data source based on attribute field values';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const;
  
  readonly inputSchema = AttributeFilterInputSchema;
  readonly outputSchema = SpatialOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof AttributeFilterInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof SpatialOutputSchema>> {
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    const dataSourceRepo = new DataSourceRepository(this.db!);
    const resultPersistence = new ResultPersistenceService(this.db!);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    // Build filter condition
    const filterCondition = {
      field: params.field,
      operator: params.operator,
      value: params.value
    };
    
    const result = await dataAccess.filter(
      dataSource.type,
      dataSource.reference,
      filterCondition as any
    );
    
    // Persist result (returns NativeData)
    const persistedResult = await resultPersistence.persistResult(
      result,
      'attribute_filter',
      dataSource,
      {
        field: params.field,
        operator: params.operator
      }
    );
    
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: {
        ...persistedResult.metadata,
        operation: 'attribute_filter',
        filteredCount: (persistedResult as any).features?.length || 0
      }
    };
  }
}
