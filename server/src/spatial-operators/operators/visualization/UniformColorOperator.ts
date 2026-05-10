/**
 * UniformColorOperator - Renders all features with uniform color
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../../SpatialOperator';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const UniformColorInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source'),
  color: z.string().default('#3388ff').describe('Hex color code'),
  opacity: z.number().min(0).max(1).default(0.8),
  strokeWidth: z.number().min(0).max(10).default(2),
  layerName: z.string().optional()
});

const UniformColorOutputSchema = z.object({
  id: z.string().describe('Unique identifier'),
  type: z.string().describe('Data type (geojson, postgis, etc.)'),
  reference: z.string().describe('File path or table reference'),
  metadata: z.object({
    result: z.string().describe('Output file path or reference'),
    styleConfig: z.object({
      type: z.literal('uniform'),
      color: z.string(),
      opacity: z.number(),
      strokeWidth: z.number(),
      layerName: z.string()
    }).optional(),
    geometryType: z.string().optional(),
    featureCount: z.number().optional()
  })
  .catchall(z.any()) // Allow additional metadata fields (e.g., PostGIS connection info)
  .describe('Metadata including style configuration')
});

export class UniformColorOperator extends SpatialOperator {
  readonly operatorId = 'uniform_color_renderer';
  readonly name = 'Uniform Color Renderer';
  readonly description = 'Render all features with a single uniform color';
  readonly category = 'visualization' as const;
  
  readonly inputSchema = UniformColorInputSchema;
  readonly outputSchema = UniformColorOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof UniformColorInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof UniformColorOutputSchema>> {
    if (!this.db || !this.workspaceBase) {
      throw new Error('Database and workspace not available');
    }
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const resultPersistence = new ResultPersistenceService(this.db);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    // Uniform color is a frontend rendering concern
    // We just pass through the original data reference with style metadata
    const styleConfig = {
      type: 'uniform',
      color: params.color,
      opacity: params.opacity,
      strokeWidth: params.strokeWidth,
      layerName: params.layerName || dataSource.name
    };
    
    // Persist result with style metadata (no data transformation)
    console.log(`[UniformColorOperator] Source dataSource.metadata keys:`, Object.keys(dataSource.metadata || {}));
    console.log(`[UniformColorOperator] Has connection info:`, !!dataSource.metadata?.connection);
    
    const persisted = await resultPersistence.persistResult(
      {
        id: `uniform_${Date.now()}`,
        type: dataSource.type,
        reference: dataSource.reference, // Pass through original reference
        metadata: {
          ...dataSource.metadata,
          dataSourceId: dataSource.id, // Add dataSourceId for secure password retrieval
          result: dataSource.reference, // Standardized output: pass through reference
          styleConfig
        },
        createdAt: new Date()
      },
      'uniform_color',
      dataSource,
      { color: params.color }
    );
    
    console.log(`[UniformColorOperator] Persisted result metadata keys:`, Object.keys(persisted.metadata || {}));
    console.log(`[UniformColorOperator] Persisted has connection info:`, !!persisted.metadata?.connection);
    
    // Return complete NativeData structure so metadata is preserved
    return {
      id: persisted.id,
      type: persisted.type,
      reference: persisted.reference,
      metadata: persisted.metadata
    };
  }
}
