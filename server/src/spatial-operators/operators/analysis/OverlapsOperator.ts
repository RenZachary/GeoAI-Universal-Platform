/**
 * OverlapsOperator - Filters features that overlap with a reference geometry
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, SpatialOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const OverlapsInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to filter'),
  referenceDataSourceId: z.string().describe('ID of the reference data source')
});

export class OverlapsOperator extends SpatialOperator {
  readonly operatorId = 'overlaps';
  readonly name = 'Overlaps Filter';
  readonly description = 'Filter features that spatially overlap with a reference data source';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const;
  
  readonly inputSchema = OverlapsInputSchema;
  readonly outputSchema = SpatialOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }

  protected async executeCore(
    params: z.infer<typeof OverlapsInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof SpatialOutputSchema>> {
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    if(!this.db) throw new Error('Database instance not provided');
    const dataSourceRepo = new DataSourceRepository(this.db);
    const resultPersistence = new ResultPersistenceService(this.db);

    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    if (!dataSource) throw new Error(`Data source not found: ${params.dataSourceId}`);

    const filterCondition = {
      type: 'spatial',
      operation: 'overlaps',
      referenceDataSourceId: params.referenceDataSourceId
    };

    const result = await dataAccess.filter(dataSource.type, dataSource.reference, filterCondition as any);
    const persistedResult = await resultPersistence.persistResult(result, 'overlaps', dataSource, { referenceDataSourceId: params.referenceDataSourceId });
    
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: {
        ...persistedResult.metadata,
        operation: 'overlaps',
        filteredCount: (persistedResult as any).features?.length || 0
      }
    };
  }
}
