/**
 * ChoroplethOperator - Creates graduated color maps
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../SpatialOperator';
import { DataSourceRepository } from '../../data-access/repositories';
import { ResultPersistenceService } from '../../services/ResultPersistenceService';
import type Database from 'better-sqlite3';

const ChoroplethInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source'),
  valueField: z.string().describe('Numeric field for classification'),
  classification: z.enum(['quantile', 'equal_interval', 'standard_deviation', 'jenks']).default('quantile'),
  numClasses: z.number().min(3).max(9).default(5),
  colorRamp: z.string().default('greens'),
  opacity: z.number().min(0).max(1).default(0.8),
  layerName: z.string().optional()
});

const ChoroplethOutputSchema = z.object({
  id: z.string().describe('Unique identifier'),
  type: z.string().describe('Data type (geojson, postgis, etc.)'),
  reference: z.string().describe('File path or table reference'),
  metadata: z.object({
    result: z.string().describe('Output file path or reference'),
    styleConfig: z.object({
      type: z.literal('choropleth'),
      valueField: z.string(),
      classification: z.string(),
      numClasses: z.number(),
      colorRamp: z.string(),
      opacity: z.number(),
      layerName: z.string()
    }).optional(),
    geometryType: z.string().optional(),
    featureCount: z.number().optional()
  }).describe('Metadata including style configuration')
});

export class ChoroplethOperator extends SpatialOperator {
  readonly operatorId = 'choropleth_renderer';
  readonly name = 'Choropleth Renderer';
  readonly description = 'Create statistical choropleth maps with graduated colors based on numeric field values';
  readonly category = 'visualization' as const;
  
  readonly inputSchema = ChoroplethInputSchema;
  readonly outputSchema = ChoroplethOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof ChoroplethInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof ChoroplethOutputSchema>> {
    if (!this.db || !this.workspaceBase) {
      throw new Error('Database and workspace not available');
    }
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const resultPersistence = new ResultPersistenceService(this.db);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    // Choropleth is a frontend rendering concern
    // Create style configuration for frontend to apply
    const styleConfig = {
      type: 'choropleth',
      valueField: params.valueField,
      classification: params.classification,
      numClasses: params.numClasses,
      colorRamp: params.colorRamp,
      opacity: params.opacity,
      layerName: params.layerName || dataSource.name
    };
    
    // Persist result with style metadata (no data transformation)
    const persisted = await resultPersistence.persistResult(
      {
        id: `choropleth_${Date.now()}`,
        type: dataSource.type,
        reference: dataSource.reference, // Pass through original reference
        metadata: {
          ...dataSource.metadata,
          result: dataSource.reference, // Standardized output field
          styleConfig
        },
        createdAt: new Date()
      },
      'choropleth',
      dataSource,
      { valueField: params.valueField }
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
