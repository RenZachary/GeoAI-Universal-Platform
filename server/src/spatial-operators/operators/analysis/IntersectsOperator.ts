/**
 * IntersectsOperator - Filters features that intersect with a reference geometry
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, SpatialOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const IntersectsInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to filter'),
  referenceDataSourceId: z.string().describe('ID of the reference data source (e.g., viewport)')
});

export class IntersectsOperator extends SpatialOperator {
  readonly operatorId = 'intersects';
  readonly name = 'Intersects Filter';
  readonly description = 'Filter features that spatially intersect with a reference data source';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const;
  
  readonly inputSchema = IntersectsInputSchema;
  readonly outputSchema = SpatialOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof IntersectsInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof SpatialOutputSchema>> {
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    const dataSourceRepo = new DataSourceRepository(this.db!);
    const resultPersistence = new ResultPersistenceService(this.db!);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    const refDataSource = dataSourceRepo.getById(params.referenceDataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    if (!refDataSource) {
      throw new Error(`Reference data source not found: ${params.referenceDataSourceId}`);
    }
    
    // Build spatial filter condition with referenceDataSourceId
    // Backend will resolve the reference to actual geometry
    const filterCondition = {
      type: 'spatial',
      operation: 'intersects',
      referenceDataSourceId: params.referenceDataSourceId
    };
    
    const result = await dataAccess.filter(
      dataSource.type,
      dataSource.reference,
      filterCondition as any
    );
    
    // Persist result (returns NativeData)
    const persistedResult = await resultPersistence.persistResult(
      result,
      'intersects',
      dataSource,
      { referenceDataSourceId: params.referenceDataSourceId }
    );
    
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: {
        ...persistedResult.metadata,
        operation: 'intersects',
        filteredCount: (persistedResult as any).features?.length || 0
      }
    };
  }
}
