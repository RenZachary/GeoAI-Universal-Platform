/**
 * DistanceLessThanOperator - Filters features within a specified distance from reference geometry
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, SpatialOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import * as Database from 'better-sqlite3';

const DistanceLessThanInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to filter'),
  referenceDataSourceId: z.string().describe('ID of the reference data source'),
  distance: z.number().positive().describe('Maximum distance threshold'),
  unit: z.enum(['meters', 'kilometers', 'feet', 'miles', 'degrees']).optional().default('meters').describe('Distance unit')
});

export class DistanceLessThanOperator extends SpatialOperator {
  readonly operatorId = 'distance_less_than';
  readonly name = 'Distance Less Than Filter';
  readonly description = 'Filter features that are within a specified distance from a reference data source';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const;
  
  readonly inputSchema = DistanceLessThanInputSchema;
  readonly outputSchema = SpatialOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }

  protected async executeCore(
    params: z.infer<typeof DistanceLessThanInputSchema>,
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

    // Create spatial filter condition with distance
    const filterCondition = {
      type: 'spatial' as const,
      operation: 'distance_less_than' as const,
      referenceDataSourceId: params.referenceDataSourceId,
      distance: params.distance,
      unit: params.unit
    };

    const result = await dataAccess.filter(
      dataSource.type,
      dataSource.reference,
      filterCondition as any
    );
    
    // Persist result (returns NativeData)
    const persistedResult = await resultPersistence.persistResult(
      result,
      'distance_less_than',
      dataSource,
      { 
        referenceDataSourceId: params.referenceDataSourceId,
        distance: params.distance,
        unit: params.unit
      }
    );
    
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: {
        ...persistedResult.metadata,
        operation: 'distance_less_than',
        filteredCount: (persistedResult as any).features?.length || 0,
        distance: params.distance,
        unit: params.unit
      }
    };
  }
}
