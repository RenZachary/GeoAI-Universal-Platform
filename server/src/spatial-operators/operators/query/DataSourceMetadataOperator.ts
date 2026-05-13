/**
 * DataSourceMetadataOperator - Query metadata of a specific data source
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, AnalyticalOutputSchema } from '../../SpatialOperator';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';

const DataSourceMetadataInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to query (can be persistent or virtual)'),
  conversationId: z.string().optional().describe('Conversation ID for virtual data source lookup'),
  includeFields: z.boolean().default(true).describe('Include field/schema information'),
  includeStatistics: z.boolean().default(false).describe('Include statistical information if available')
});

const DataSourceMetadataOutputSchema = AnalyticalOutputSchema.extend({
  data: z.object({
    dataSourceId: z.string().describe('ID of the queried data source'),
    name: z.string().describe('Data source name'),
    type: z.string().describe('Data source type (geojson, shapefile, postgis, etc.)'),
    geometryType: z.string().optional().describe('Geometry type (Point, LineString, Polygon, etc.)'),
    featureCount: z.number().optional().describe('Number of features'),
    bbox: z.array(z.number()).optional().describe('Bounding box [minX, minY, maxX, maxY]'),
    fields: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string().optional()
    })).optional().describe('Field/schema information'),
    metadata: z.record(z.any()).optional().describe('Additional metadata')
  })
});

export class DataSourceMetadataOperator extends SpatialOperator {
  readonly operatorId = 'datasource_metadata';
  readonly name = 'Data Source Metadata Query';
  readonly description = 'Query metadata information of a specific data source including name, type, geometry, fields, and statistics. Use this when users ask about data source properties or structure.';
  readonly category = 'query' as const;
  readonly returnType = 'analytical' as const;
  
  readonly inputSchema = DataSourceMetadataInputSchema;
  readonly outputSchema = DataSourceMetadataOutputSchema;
  
  private db?: Database.Database;
  
  constructor(db?: Database.Database) {
    super();
    this.db = db;
  }
  
  protected async executeCore(
    params: z.infer<typeof DataSourceMetadataInputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof DataSourceMetadataOutputSchema>> {
    console.log('[DataSourceMetadataOperator] Querying metadata for:', params.dataSourceId);
    
    let dataSource: any = null;
    
    // If not found in virtual sources, try persistent data sources
    if (!dataSource && this.db) {
      const dataSourceRepo = new DataSourceRepository(this.db);
      dataSource = dataSourceRepo.getById(params.dataSourceId);
      
      if (dataSource) {
        console.log('[DataSourceMetadataOperator] Found persistent data source');
      }
    }
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    // Build metadata response
    console.log('[DataSourceMetadataOperator] Building metadata response...');
    console.log('[DataSourceMetadataOperator] dataSource:',dataSource);
    const result: any = {
      dataSourceId: params.dataSourceId,
      name: dataSource.name,
      type: dataSource?.type,
      metadata: dataSource?.metadata
    };
    
    // Add persistent data source info
      if (dataSource.geometry_type) {
        result.geometryType = dataSource.geometry_type;
      }
      
      if (dataSource.feature_count !== undefined) {
        result.featureCount = dataSource.feature_count;
      }
      
      if (dataSource.bbox) {
        result.bbox = dataSource.bbox;
      }
      
      // Add field information if requested
      if (params.includeFields && dataSource.fields) {
        result.fields = dataSource.fields.map((field: any) => ({
          name: field.name,
          type: field.type,
          description: field.description
        }));
      }
    
    console.log('[DataSourceMetadataOperator] Metadata query completed:', {
      dataSourceId: result.dataSourceId,
      name: result.name,
      type: result.type
    });
    
    return {
      success: true,
      data: result,
      metadata: {
        operatorId: this.operatorId,
        executedAt: new Date().toISOString(),
        summary: `Retrieved metadata for data source: ${result.name}`
      }
    };
  }
}
