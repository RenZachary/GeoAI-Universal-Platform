/**
 * DisjointOperator - Filters features that are disjoint from a reference geometry
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, SpatialOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import * as Database from 'better-sqlite3';

const DisjointInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to filter'),
  referenceDataSourceId: z.string().describe('ID of the reference data source')
});

export class DisjointOperator extends SpatialOperator {
  readonly operatorId = 'disjoint';
  readonly name = 'Disjoint Filter';
  readonly description = 'Filter features that are spatially disjoint from a reference data source';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const;
  
  readonly inputSchema = DisjointInputSchema;
  readonly outputSchema = SpatialOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }

  protected async executeCore(
    params: z.infer<typeof DisjointInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof SpatialOutputSchema>> {
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    const dataSourceRepo = new DataSourceRepository(this.db!);
    const resultPersistence = new ResultPersistenceService(this.db!);

    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    if (!dataSource) throw new Error(`Data source not found: ${params.dataSourceId}`);

    const filterCondition = {
      type: 'spatial',
      operation: 'disjoint',
      referenceDataSourceId: params.referenceDataSourceId
    };

    const result = await dataAccess.filter(dataSource.type, dataSource.reference, filterCondition as any);
    const persistedResult = await resultPersistence.persistResult(result, 'disjoint', dataSource, { referenceDataSourceId: params.referenceDataSourceId });
    
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: {
        ...persistedResult.metadata,
        operation: 'disjoint',
        filteredCount: (persistedResult as any).features?.length || 0
      }
    };
  }
}
