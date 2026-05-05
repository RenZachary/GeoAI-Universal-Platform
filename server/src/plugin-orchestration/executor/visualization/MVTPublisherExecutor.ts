/**
 * MVT Publisher Plugin Executor
 * Generates Mapbox Vector Tiles from spatial data sources
 */

import type { NativeData, DataSourceType } from '../../../core/index';
import { DataAccessorFactory } from '../../../data-access/factories/DataAccessorFactory.js';
import { MVTPublisher } from '../../../utils/publishers/MVTPublisher.js';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MVTPublisherParams {
  dataSourceId: string;
  minZoom?: number;
  maxZoom?: number;
  layerName?: string;
}

export class MVTPublisherExecutor {
  private db: Database.Database;
  private workspaceBase: string;

  constructor(db: Database.Database, workspaceBase?: string) {
    this.db = db;
    this.workspaceBase = workspaceBase || path.join(__dirname, '..', '..', '..', '..', 'workspace');
  }

  async execute(params: MVTPublisherParams): Promise<NativeData> {
    console.log('[MVTPublisherExecutor] Executing MVT publishing...');
    console.log('[MVTPublisherExecutor] Params:', params);

    const { dataSourceId, minZoom = 0, maxZoom = 14, layerName = 'default' } = params;

    try {
      // Step 1: Get data source metadata from database
      const dataSourceRepo = new DataSourceRepository(this.db);
      const dataSource = dataSourceRepo.getById(dataSourceId);
      
      if (!dataSource) {
        throw new Error(`Data source not found: ${dataSourceId}`);
      }
      
      console.log(`[MVTPublisherExecutor] Data source type: ${dataSource.type}`);
      console.log(`[MVTPublisherExecutor] Data source reference: ${dataSource.reference}`);
      
      // Step 2: Read data source using DataAccessorFactory
      const factory = new DataAccessorFactory();
      const accessor = factory.createAccessor(dataSource.type);
      
      console.log(`[MVTPublisherExecutor] Using accessor type: ${dataSource.type}`);
      
      // Read the NativeData using the file path (reference), not the UUID
      const nativeData = await accessor.read(dataSource.reference);
      console.log(`[MVTPublisherExecutor] Loaded NativeData: id=${nativeData.id}, type=${nativeData.type}`);
      
      // Step 3: Generate MVT tiles using MVTPublisher with strategy pattern
      // MVTPublisher will automatically select the appropriate strategy based on nativeData.type
      // Use singleton instance to share tile cache with MVTServiceController
      const mvtPublisher = MVTPublisher.getInstance(this.workspaceBase);
      const tilesetId = await mvtPublisher.generateTiles(nativeData, {
        minZoom,
        maxZoom,
        layerName
      });
      
      console.log(`[MVTPublisherExecutor] Generated tileset: ${tilesetId}`);
      
      // Step 4: Return result as NativeData with MVT service URL
      return {
        id: tilesetId,
        type: 'mvt',
        reference: `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`,
        metadata: {
          tilesetId,
          serviceUrl: `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`,
          minZoom,
          maxZoom,
          layerName,
          generatedAt: new Date().toISOString(),
          dataSourceId,
          originalDataType: nativeData.type,
          generationStrategy: nativeData.type === 'geojson' ? 'geojson-vt' : 'pending'
        },
        createdAt: new Date()
      };
    } catch (error) {
      console.error('[MVTPublisherExecutor] Execution failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const wrappedError = new Error(`MVT publishing failed: ${errorMessage}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }
}
