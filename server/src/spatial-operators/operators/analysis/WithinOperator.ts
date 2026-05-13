/**
 * WithinOperator - Filters features that are within a reference geometry
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, SpatialOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const WithinInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to filter'),
  referenceDataSourceId: z.string().describe('ID of the reference data source')
});

export class WithinOperator extends SpatialOperator {
  readonly operatorId = 'within';
  readonly name = 'Within Filter';
  readonly description = 'Filter features that are spatially within a reference data source';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const;
  
  readonly inputSchema = WithinInputSchema;
  readonly outputSchema = SpatialOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof WithinInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof SpatialOutputSchema>> {
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    const dataSourceRepo = new DataSourceRepository(this.db!);
    const resultPersistence = new ResultPersistenceService(this.db!);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    const refDataSource = dataSourceRepo.getById(params.referenceDataSourceId);
    
    if (!dataSource) throw new Error(`Data source not found: ${params.dataSourceId}`);
    if (!refDataSource) throw new Error(`Reference data source not found: ${params.referenceDataSourceId}`);
    
    const filterCondition = {
      type: 'spatial',
      operation: 'within',
      referenceDataSourceId: params.referenceDataSourceId
    };
    
    const result = await dataAccess.filter(dataSource.type, dataSource.reference, filterCondition as any);
    const persistedResult = await resultPersistence.persistResult(result, 'within', dataSource, { referenceDataSourceId: params.referenceDataSourceId });
    
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: { ...persistedResult.metadata, operation: 'within', filteredCount: (persistedResult as any).features?.length || 0 }
    };
  }
}
