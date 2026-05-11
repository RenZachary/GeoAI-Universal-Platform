/**
 * SpatialJoinOperator - Joins two datasets based on spatial relationships
 * 
 * Combines attributes from two datasets where their geometries satisfy
 * a spatial relationship (intersects, within, contains, touches, etc.)
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, SpatialOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const SpatialJoinInputSchema = z.object({
  targetDataSourceId: z.string().describe('ID of the target (primary) data source'),
  joinDataSourceId: z.string().describe('ID of the join (secondary) data source'),
  operation: z.enum(['intersects', 'within', 'contains', 'touches', 'crosses', 'overlaps'])
    .default('intersects')
    .describe('Spatial relationship for joining'),
  joinType: z.enum(['inner', 'left', 'right'])
    .default('inner')
    .describe('Join type: inner (only matches), left (all target), right (all join)')
});

// Output schema extends SpatialOutputSchema - Spatial join produces new spatial data
const SpatialJoinOutputSchema = SpatialOutputSchema.extend({
  metadata: z.object({
    operation: z.string().describe('Spatial join operation type'),
    joinType: z.string().describe('Join type (inner/left/right)'),
    featureCount: z.number().describe('Number of features in the result'),
    targetDataSourceId: z.string().describe('Target data source ID'),
    joinDataSourceId: z.string().describe('Join data source ID')
  }).optional()
});

export class SpatialJoinOperator extends SpatialOperator {
  readonly operatorId = 'spatial_join';
  readonly name = 'Spatial Join';
  readonly description = 'Join attributes from two datasets based on spatial relationships (intersects, within, contains, etc.)';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const; // Produces new spatial data with combined attributes
  
  readonly inputSchema = SpatialJoinInputSchema;
  readonly outputSchema = SpatialJoinOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof SpatialJoinInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof SpatialJoinOutputSchema>> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }
    
    console.log('[SpatialJoinOperator] Starting spatial join...');
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    const resultPersistence = new ResultPersistenceService(this.db);
    
    // Query both data sources
    const targetDS = dataSourceRepo.getById(params.targetDataSourceId);
    const joinDS = dataSourceRepo.getById(params.joinDataSourceId);
    
    if (!targetDS || !joinDS) {
      throw new Error('One or both data sources not found');
    }
    
    console.log('[SpatialJoinOperator] Data sources:', {
      target: { id: targetDS.id, name: targetDS.name, type: targetDS.type },
      join: { id: joinDS.id, name: joinDS.name, type: joinDS.type }
    });
    
    // Check backend compatibility for VectorBackend
    // Note: VectorBackend spatial join has O(n²) complexity, warn for large datasets
    if (targetDS.type === 'geojson' || targetDS.type === 'shapefile') {
      const targetMetadata = await dataAccess.getMetadata(targetDS.type, targetDS.reference);
      const targetCount = targetMetadata?.featureCount || 0;
      
      if (targetCount > 1000) {
        console.warn(`[SpatialJoinOperator] VectorBackend spatial join with ${targetCount} features may be slow. Consider using PostGIS for better performance.`);
      }
    }
    
    // Execute spatial join using DataAccessFacade
    const result = await dataAccess.spatialJoin(
      targetDS.type,
      targetDS.reference,
      joinDS.reference,
      params.operation,
      params.joinType
    );
    
    console.log('[SpatialJoinOperator] Spatial join completed successfully');
    
    // Persist result to database (registers temp table if PostGIS)
    const persistedResult = await resultPersistence.persistResult(
      result,
      'spatial_join',
      targetDS,
      { 
        operation: params.operation, 
        joinType: params.joinType,
        joinDataSourceId: params.joinDataSourceId
      }
    );
    
    console.log('[SpatialJoinOperator] Persisted result:', {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      featureCount: persistedResult.metadata?.featureCount
    });
    
    // Return NativeData structure for chaining
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: {
        ...persistedResult.metadata,
        operation: params.operation,
        joinType: params.joinType,
        featureCount: persistedResult.metadata?.featureCount || 0,
        targetDataSourceId: params.targetDataSourceId,
        joinDataSourceId: params.joinDataSourceId
      }
    };
  }
}
