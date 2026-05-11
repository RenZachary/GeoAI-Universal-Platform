/**
 * CategoricalOperator - Renders categorical data with distinct colors
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../../SpatialOperator';
import { DataSourceRepository } from '../../../data-access/repositories';
import { ResultPersistenceService } from '../../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const CategoricalInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source'),
  categoryField: z.string().describe('Categorical field name'),
  colorPalette: z.string().default('set1').describe('Color palette name'),
  opacity: z.number().min(0).max(1).default(0.8),
  layerName: z.string().optional()
});

const CategoricalOutputSchema = z.object({
  id: z.string().describe('Unique identifier'),
  type: z.string().describe('Data type (geojson, postgis, etc.)'),
  reference: z.string().describe('File path or table reference'),
  metadata: z.object({
    result: z.string().describe('Output file path or reference'),
    styleConfig: z.object({
      type: z.literal('categorical'),
      categoryField: z.string(),
      colorPalette: z.string(),
      opacity: z.number(),
      layerName: z.string()
    }).optional(),
    categories: z.array(z.string()).optional(),
    geometryType: z.string().optional(),
    featureCount: z.number().optional()
  }).describe('Metadata including style configuration')
});

export class CategoricalOperator extends SpatialOperator {
  readonly operatorId = 'categorical_renderer';
  readonly name = 'Categorical Renderer';
  readonly description = 'Render categorical data with distinct colors for each category';
  readonly category = 'visualization' as const;
  readonly returnType = 'spatial' as const; // Returns styled spatial data
  
  readonly inputSchema = CategoricalInputSchema;
  readonly outputSchema = CategoricalOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof CategoricalInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof CategoricalOutputSchema>> {
    if (!this.db || !this.workspaceBase) {
      throw new Error('Database and workspace not available');
    }
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const resultPersistence = new ResultPersistenceService(this.db);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    // Categorical rendering is a frontend concern
    // Create style configuration for frontend to apply distinct colors per category
    const styleConfig = {
      type: 'categorical',
      categoryField: params.categoryField,
      colorPalette: params.colorPalette,
      opacity: params.opacity,
      layerName: params.layerName || dataSource.name
    };
    
    // Categories will be extracted by frontend from actual data
    const categories: string[] = [];
    
    // Persist result with style metadata (no data transformation)
    const persisted = await resultPersistence.persistResult(
      {
        id: `categorical_${Date.now()}`,
        type: dataSource.type,
        reference: dataSource.reference, // Pass through original reference
        metadata: {
          ...dataSource.metadata,
          result: dataSource.reference, // Standardized output field
          styleConfig,
          categories
        },
        createdAt: new Date()
      },
      'categorical',
      dataSource,
      { categoryField: params.categoryField }
    );
    
    // Return complete NativeData structure so metadata is preserved
    return {
      id: persisted.id,
      type: persisted.type,
      reference: persisted.reference,
      metadata: persisted.metadata
    };
  }
}
