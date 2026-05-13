/**
 * BufferOperator - Creates buffer zones around spatial features
 * 
 * Unified operator replacing BufferAnalysisPlugin + BufferAnalysisExecutor
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

// Input schema using Zod
const BufferInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the input data source to buffer'),
  distance: z.number().min(0).describe('Buffer distance'),
  unit: z.enum(['meters', 'kilometers', 'feet', 'miles']).default('meters').describe('Unit of measurement'),
  dissolve: z.boolean().default(false).describe('Whether to dissolve overlapping buffers')
});

// Output schema using Zod - returns complete NativeData structure
const BufferOutputSchema = z.object({
  id: z.string().describe('Unique identifier for the result'),
  type: z.string().describe('Data source type (postgis, geojson, etc.)'),
  reference: z.string().describe('Reference to the buffered data'),
  metadata: z.record(z.any()).optional().describe('Metadata including connection info for MVT publishing')
});

export class BufferOperator extends SpatialOperator {
  readonly operatorId = 'buffer_analysis';
  readonly name = 'Buffer Analysis';
  readonly description = 'Create buffer zones around spatial features based on specified distance';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const; // Produces new spatial data
  
  readonly inputSchema = BufferInputSchema;
  readonly outputSchema = BufferOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof BufferInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof BufferOutputSchema>> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }
    
    // Initialize services
    const dataSourceRepo = new DataSourceRepository(this.db);
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    const resultPersistence = new ResultPersistenceService(this.db);
    
    // Step 1: Query database for data source metadata
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    // Step 2: Execute buffer operation using DataAccessFacade
    const result = await dataAccess.buffer(
      dataSource.type,
      dataSource.reference,
      params.distance,
      {
        unit: params.unit,
        dissolve: params.dissolve
      }
    );
    
    // Step 4: Persist result
    const persistedResult = await resultPersistence.persistResult(
      result,
      'buffer',
      dataSource,
      { distance: params.distance, unit: params.unit }
    );
    
    // Return complete NativeData structure so metadata (including connection info) is preserved for MVT publishing
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: persistedResult.metadata
    };
  }
}
