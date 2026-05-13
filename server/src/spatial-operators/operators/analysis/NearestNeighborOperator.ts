/**
 * NearestNeighborOperator - Finds the nearest features to a reference geometry
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, SpatialOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import * as Database from 'better-sqlite3';

const NearestNeighborInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to search'),
  referenceDataSourceId: z.string().describe('ID of the reference data source'),
  limit: z.number().positive().optional().default(1).describe('Maximum number of nearest neighbors to return')
});

export class NearestNeighborOperator extends SpatialOperator {
  readonly operatorId = 'nearest_neighbor';
  readonly name = 'Nearest Neighbor Search';
  readonly description = 'Find the nearest features to a reference data source';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const;
  
  readonly inputSchema = NearestNeighborInputSchema;
  readonly outputSchema = SpatialOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }

  protected async executeCore(
    params: z.infer<typeof NearestNeighborInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof SpatialOutputSchema>> {
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    const dataSourceRepo = new DataSourceRepository(this.db!);
    const resultPersistence = new ResultPersistenceService(this.db!);

    // Get target data source
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }

    // Create spatial filter condition for nearest neighbor
    const filterCondition = {
      type: 'spatial' as const,
      operation: 'nearest' as const,
      referenceDataSourceId: params.referenceDataSourceId,
      limit: params.limit
    };

    const result = await dataAccess.filter(
      dataSource.type,
      dataSource.reference,
      filterCondition as any
    );
    
    // Persist result (returns NativeData)
    const persistedResult = await resultPersistence.persistResult(
      result,
      'nearest_neighbor',
      dataSource,
      { 
        referenceDataSourceId: params.referenceDataSourceId,
        limit: params.limit
      }
    );
    
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: {
        ...persistedResult.metadata,
        operation: 'nearest_neighbor',
        filteredCount: (persistedResult as any).features?.length || 0,
        limit: params.limit
      }
    };
  }
}
