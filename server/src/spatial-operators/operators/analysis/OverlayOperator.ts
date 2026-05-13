/**
 * OverlayOperator - Performs spatial overlay operations between datasets
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, SpatialOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const OverlayInputSchema = z.object({
  inputDataSourceId: z.string().describe('Primary input data source ID'),
  overlayDataSourceId: z.string().describe('Overlay data source ID'),
  operation: z.enum(['intersect', 'union', 'difference', 'symmetric_difference']).default('intersect').describe('Overlay operation type')
});

// Output schema extends SpatialOutputSchema - Overlay produces new spatial data
const OverlayOutputSchema = SpatialOutputSchema.extend({
  metadata: z.object({
    operation: z.string().describe('Overlay operation type (intersect, union, difference, etc.)'),
    featureCount: z.number().describe('Number of features in the result'),
    inputDataSourceId: z.string().describe('Primary input data source ID'),
    overlayDataSourceId: z.string().describe('Overlay data source ID')
  }).optional()
});

export class OverlayOperator extends SpatialOperator {
  readonly operatorId = 'overlay_analysis';
  readonly name = 'Overlay Analysis';
  readonly description = 'Perform spatial overlay operations (intersect, union, difference) between two datasets to generate new geometries. Use for spatial analysis that requires geometric computation and combination of multiple datasets.';
  readonly category = 'analysis' as const;
  readonly returnType = 'spatial' as const; // Produces new spatial data
  
  readonly inputSchema = OverlayInputSchema;
  readonly outputSchema = OverlayOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof OverlayInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof OverlayOutputSchema>> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }
    
    console.log('[OverlayOperator] Starting overlay analysis...');
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    const resultPersistence = new ResultPersistenceService(this.db);
    
    // Query both data sources
    const dataSource1 = dataSourceRepo.getById(params.inputDataSourceId);
    const dataSource2 = dataSourceRepo.getById(params.overlayDataSourceId);
    
    if (!dataSource1 || !dataSource2) {
      throw new Error('One or both data sources not found');
    }
    
    // Execute overlay operation using DataAccessFacade
    const result = await dataAccess.overlay(
      dataSource1.type,
      dataSource1.reference,
      dataSource2.reference,
      params.operation
    );
    
    // Persist result to database (registers temp table)
    const persistedResult = await resultPersistence.persistResult(
      result,
      'overlay',
      dataSource1,
      { operation: params.operation }
    );
    
    // Return NativeData structure for chaining
    return {
      id: persistedResult.id,
      type: persistedResult.type,
      reference: persistedResult.reference,
      metadata: {
        ...persistedResult.metadata,
        operation: params.operation,
        featureCount: persistedResult.metadata?.featureCount || 0,
        inputDataSourceId: params.inputDataSourceId,
        overlayDataSourceId: params.overlayDataSourceId
      }
    };
  }
}
