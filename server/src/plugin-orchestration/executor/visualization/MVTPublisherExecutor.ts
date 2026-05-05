/**
 * MVT Publisher Plugin Executor
 * Generates Mapbox Vector Tiles from spatial data sources
 */

import type { NativeData, DataSourceType } from '../../../core/index';
import { DataAccessorFactory } from '../../../data-access/factories/DataAccessorFactory';
import { MVTPublisher } from '../../../utils/publishers/MVTPublisher';
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
  protected db: Database.Database;
  protected workspaceBase: string;
  protected dataSourceRepo: DataSourceRepository;
  protected accessorFactory: DataAccessorFactory;

  constructor(db: Database.Database, workspaceBase?: string) {
    this.db = db;
    this.workspaceBase = workspaceBase || path.join(__dirname, '..', '..', '..', '..', 'workspace');
    this.dataSourceRepo = new DataSourceRepository(this.db);
    this.accessorFactory = new DataAccessorFactory(this.workspaceBase);
  }

  async execute(params: MVTPublisherParams): Promise<NativeData> {
    console.log('[MVTPublisherExecutor] Executing MVT publishing...');
    console.log('[MVTPublisherExecutor] Params:', params);

    const { dataSourceId, minZoom = 0, maxZoom = 22, layerName = 'default' } = params;

    try {
      // Step 1: Load data source using helper method
      const { dataSource, nativeData } = await this.loadDataSource(dataSourceId);
      
      console.log(`[MVTPublisherExecutor] Data source type: ${dataSource.type}`);
      console.log(`[MVTPublisherExecutor] Data source reference: ${dataSource.reference}`);
      console.log(`[MVTPublisherExecutor] Loaded NativeData: id=${nativeData.id}, type=${nativeData.type}`);
      
      // Step 2: Generate MVT tiles using MVTPublisher with strategy pattern
      // MVTPublisher will automatically select the appropriate strategy based on nativeData.type
      // Use singleton instance to share tile cache with MVTServiceController
      const mvtPublisher = MVTPublisher.getInstance(this.workspaceBase);
      const tilesetId = await mvtPublisher.generateTiles(nativeData, {
        minZoom,
        maxZoom,
        layerName
      });
      
      console.log(`[MVTPublisherExecutor] Generated tileset: ${tilesetId}`);
      
      // Step 3: Return result as NativeData with MVT service URL
      return this.createMVTResult(tilesetId, dataSourceId, nativeData.type, {
        minZoom,
        maxZoom,
        layerName,
        generationStrategy: nativeData.type === 'geojson' ? 'geojson-vt' : 'pending'
      });
    } catch (error) {
      console.error('[MVTPublisherExecutor] Execution failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const wrappedError = new Error(`MVT publishing failed: ${errorMessage}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }

  /**
   * Helper: Load and validate data source
   */
  protected async loadDataSource(dataSourceId: string): Promise<{
    dataSource: any;
    nativeData: NativeData;
    accessor: any;
  }> {
    const dataSource = this.dataSourceRepo.getById(dataSourceId);
    if (!dataSource) {
      throw new Error(`Data source not found: ${dataSourceId}`);
    }

    const accessor = this.accessorFactory.createAccessor(dataSource.type);
    const nativeData = await accessor.read(dataSource.reference);

    return { dataSource, nativeData, accessor };
  }

  /**
   * Helper: Create standardized MVT result
   */
  protected createMVTResult(
    tilesetId: string,
    dataSourceId: string,
    originalDataType: DataSourceType,
    options: any
  ): NativeData {
    return {
      id: tilesetId,
      type: 'mvt',
      reference: `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`,
      metadata: {
        tilesetId,
        serviceUrl: `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`,
        dataSourceId,
        originalDataType,
        ...options,
        generatedAt: new Date().toISOString()
      },
      createdAt: new Date()
    };
  }
}
