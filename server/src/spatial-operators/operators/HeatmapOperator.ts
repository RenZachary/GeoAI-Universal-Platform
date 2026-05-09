/**
 * HeatmapOperator - Generates point density heatmaps
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../SpatialOperator';
import { DataAccessorFactory } from '../../data-access';
import { DataSourceRepository } from '../../data-access/repositories';
import { ResultPersistenceService } from '../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const HeatmapInputSchema = z.object({
  dataSourceId: z.string().describe('ID of point data source'),
  radius: z.number().min(10).max(10000).default(50).describe('Search radius in meters'),
  cellSize: z.number().min(10).max(1000).default(100).describe('Raster cell size'),
  weightField: z.string().optional().describe('Weight field name'),
  colorRamp: z.enum(['hot', 'cool', 'viridis', 'plasma', 'inferno', 'magma']).default('hot'),
  outputFormat: z.enum(['geotiff', 'png']).default('geotiff')
});

const HeatmapOutputSchema = z.object({
  result: z.string().describe('Heatmap raster file path or URL'),
  format: z.string().describe('Output format')
});

export class HeatmapOperator extends SpatialOperator {
  readonly operatorId = 'heatmap_generator';
  readonly name = 'Heatmap Generator';
  readonly description = 'Generate point density heatmaps using kernel density estimation (KDE)';
  readonly category = 'visualization' as const;
  
  readonly inputSchema = HeatmapInputSchema;
  readonly outputSchema = HeatmapOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof HeatmapInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof HeatmapOutputSchema>> {
    if (!this.db || !this.workspaceBase) {
      throw new Error('Database and workspace not available');
    }
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const accessorFactory = new DataAccessorFactory(this.workspaceBase);
    const resultPersistence = new ResultPersistenceService(this.db);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    const accessor = accessorFactory.createAccessor(dataSource.type);
    
    const result = await accessor.heatmap(dataSource.reference, {
      radius: params.radius,
      cellSize: params.cellSize,
      weightField: params.weightField,
      colorRamp: params.colorRamp,
      outputFormat: params.outputFormat
    });
    
    const persisted = await resultPersistence.persistResult(
      result,
      'heatmap',
      dataSource,
      { radius: params.radius }
    );
    
    return {
      result: persisted.reference,
      format: params.outputFormat
    };
  }
}
