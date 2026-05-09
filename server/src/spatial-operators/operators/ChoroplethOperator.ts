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
  result: z.string().describe('MVT service URL or GeoJSON path'),
  styleUrl: z.string().describe('Style configuration URL')
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
    
    return {
      result: persisted.reference,
      styleUrl: persisted.metadata?.styleUrl || ''
    };
  }
}
