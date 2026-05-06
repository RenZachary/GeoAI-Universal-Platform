/**
 * Base Renderer Executor
 * Provides unified workflow for all visualization executors
 * Reduces code duplication by centralizing common logic
 */

import type { NativeData } from '../../../core/index';
import type { DataSourceRecord } from '../../../data-access/repositories';
import { DataAccessorFactory, parseConnectionConfig } from '../../../data-access';
import { MVTStrategyPublisher } from '../../../utils/publishers/MVTStrategyPublisher';
import { DataSourceRepository } from '../../../data-access/repositories';
import { GeometryAdapter } from '../../../utils/GeometryAdapter';
import { StyleFactory } from '../../utils/StyleFactory';
import type Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BaseRendererParams {
  dataSourceId: string;
  minZoom?: number;
  maxZoom?: number;
  layerName?: string;
  opacity?: number;
}

/**
 * Abstract base class for all renderer executors
 * Implements the template method pattern for consistent workflow
 */
export abstract class BaseRendererExecutor {
  protected db: Database.Database;
  protected workspaceBase: string;
  protected dataSourceRepo: DataSourceRepository;
  protected accessorFactory: DataAccessorFactory;
  protected mvtPublisher: MVTStrategyPublisher;
  protected styleFactory: typeof StyleFactory;

  constructor(db: Database.Database, workspaceBase?: string) {
    this.db = db;
    this.workspaceBase = workspaceBase || path.join(__dirname, '..', '..', '..', '..', '..', 'workspace');
    this.dataSourceRepo = new DataSourceRepository(this.db);
    this.accessorFactory = new DataAccessorFactory(this.workspaceBase);
    this.mvtPublisher = MVTStrategyPublisher.getInstance(this.workspaceBase);
    this.styleFactory = StyleFactory;
    
    // Initialize StyleFactory directories
    this.styleFactory.initialize();
  }

  /**
   * Execute the base workflow with a custom style generator callback
   * This is the template method that defines the common workflow
   * 
   * @param params - Renderer-specific parameters
   * @param styleGenerator - Callback to generate style URL (implemented by subclass)
   * @returns NativeData result with MVT service and style information
   */
  protected async executeBaseWorkflow<T extends BaseRendererParams>(
    params: T,
    styleGenerator: (params: T, nativeData: NativeData, tilesetId: string) => Promise<string>
  ): Promise<NativeData> {
    console.log(`[${this.constructor.name}] Starting rendering workflow...`);
    console.log(`[${this.constructor.name}] Parameters:`, params);

    try {
      // Step 1: Load data source and validate
      const { dataSource, nativeData, accessor } = await this.loadDataSource(params.dataSourceId);
      
      console.log(`[${this.constructor.name}] Data source loaded: ${dataSource.type}`);
      console.log(`[${this.constructor.name}] NativeData ID: ${nativeData.id}`);
      
      // Step 2: Validate parameters (delegated to subclass)
      this.validateParams(params, dataSource);
      console.log(`[${this.constructor.name}] Parameter validation passed`);
      
      // Step 3: Generate MVT tiles
      const tilesetId = await this.mvtPublisher.generateTiles(nativeData, {
        minZoom: params.minZoom || 0,
        maxZoom: params.maxZoom || 22,
        layerName: params.layerName || 'default'
      });
      
      console.log(`[${this.constructor.name}] MVT tiles generated: ${tilesetId}`);
      
      // Store tilesetId in params for style generator
      (params as any)._tilesetId = tilesetId;
      
      // Step 4: Generate style via callback (delegated to subclass)
      const styleUrl = await styleGenerator(params, nativeData, tilesetId);
      console.log(`[${this.constructor.name}] Style generated: ${styleUrl}`);
      
      // Step 5: Build renderer-specific metadata
      const rendererMetadata = this.getRendererSpecificMetadata(params);
      
      // Step 6: Return standardized NativeData result
      const result: NativeData = {
        id: nativeData.id,
        type: 'mvt',
        reference: `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`,
        metadata: {
          ...nativeData.metadata,
          tilesetId,
          styleUrl,
          minZoom: params.minZoom || 0,
          maxZoom: params.maxZoom || 22,
          layerName: params.layerName || 'default',
          ...rendererMetadata,
          // Standardized output fields
          result: {
            tilesetId,
            styleUrl,
            serviceUrl: `/api/services/mvt/${tilesetId}`,
            rendererType: this.getRendererType()
          },
          description: `${this.getRendererType()} visualization created successfully`
        },
        createdAt: new Date()
      };
      
      console.log(`[${this.constructor.name}] Rendering workflow completed successfully`);
      return result;
      
    } catch (error) {
      console.error(`[${this.constructor.name}] Execution failed:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const wrappedError = new Error(`${this.getRendererType()} rendering failed: ${errorMessage}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }

  /**
   * Load data source and extract geometry type from metadata
   * @param dataSourceId - The data source ID
   * @returns Object containing dataSource, nativeData, and accessor
   */
  protected async loadDataSource(dataSourceId: string): Promise<{
    dataSource: DataSourceRecord;
    nativeData: NativeData;
    accessor: any;
  }> {
    console.log(`[${this.constructor.name}] Loading data source: ${dataSourceId}`);
    
    // Try to get from database first (original data sources)
    const dataSource = this.dataSourceRepo.getById(dataSourceId);
    
    if (dataSource) {
      // Case 1: dataSourceId is a registered data source in database
      console.log(`[${this.constructor.name}] Found data source in database: ${dataSource.name}`);
      
      // Configure PostGIS if needed using shared utility
      const postgisConfig = parseConnectionConfig(dataSource);
      if (postgisConfig) {
        this.accessorFactory.configurePostGIS(postgisConfig);
      }
      
      // Get geometry type from metadata (already stored in SQLite during ingestion)
      const geometryType = GeometryAdapter.getGeometryTypeFromMetadata(dataSource);
      
      if (!geometryType) {
        console.warn(`[${this.constructor.name}] Geometry type not found in metadata for data source ${dataSourceId}`);
        console.warn(`[${this.constructor.name}] Will attempt to detect from data during rendering`);
      } else {
        console.log(`[${this.constructor.name}] Geometry type from metadata: ${geometryType}`);
      }
      
      // Create appropriate accessor and read data
      const accessor = this.accessorFactory.createAccessor(dataSource.type, dataSource.metadata?.connection);
      const nativeData = await accessor.read(dataSource.reference);
      
      // Store geometry type in nativeData metadata for StyleFactory to use
      if (geometryType) {
        nativeData.metadata = {
          ...nativeData.metadata,
          geometryType
        };
      }
      
      // CRITICAL: For PostGIS, preserve connection info in nativeData.metadata
      // This is needed by MVTStrategyPublisher to generate tiles without querying database
      if (dataSource.type === 'postgis' && dataSource.metadata?.connection) {
        nativeData.metadata = {
          ...nativeData.metadata,
          connection: dataSource.metadata.connection
        };
        console.log(`[${this.constructor.name}] Preserved PostGIS connection info in nativeData.metadata`);
      }
      
      return { dataSource, nativeData, accessor };
    }
    
    // Case 2: dataSourceId is a NativeData.id from a previous step result
    // We need to find the file path from results directory or reconstruct NativeData
    console.log(`[${this.constructor.name}] Data source ID not found in database, treating as result ID`);
    
    // Search for GeoJSON files in results directory that match this ID
    const resultsDir = path.join(this.workspaceBase, 'results', 'geojson');
    const possibleFilePaths = [
      path.join(resultsDir, `${dataSourceId}.geojson`),
      // Also check if it's a timestamp-based filename
      ...(fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir)
        .filter((f: string) => f.includes(dataSourceId))
        .map((f: string) => path.join(resultsDir, f)) : [])
    ];
    
    let filePath: string | null = null;
    for (const p of possibleFilePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }
    
    if (!filePath) {
      throw new Error(`Cannot find data for ID: ${dataSourceId}. Not in database and no matching file in results directory.`);
    }
    
    console.log(`[${this.constructor.name}] Found result file: ${filePath}`);
    
    // Detect file type and create appropriate accessor
    const ext = path.extname(filePath).toLowerCase();
    const dataSourceType = ext === '.geojson' || ext === '.json' ? 'geojson' : 'shapefile';
    
    const accessor = this.accessorFactory.createAccessor(dataSourceType);
    const nativeData = await accessor.read(filePath);
    
    // Create a mock DataSourceRecord for compatibility
    const mockDataSource: DataSourceRecord = {
      id: dataSourceId,
      name: `Result_${dataSourceId.substring(0, 8)}`,
      type: dataSourceType,
      reference: filePath,
      metadata: nativeData.metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log(`[${this.constructor.name}] Loaded result data with ${nativeData.metadata?.featureCount || 0} features`);
    
    return { dataSource: mockDataSource, nativeData, accessor };
  }

  /**
   * Validate renderer-specific parameters
   * Must be implemented by subclasses
   * @param params - The parameters to validate
   * @param dataSource - The data source being rendered
   */
  protected abstract validateParams(params: any, dataSource: DataSourceRecord): void;

  /**
   * Get renderer-specific metadata to include in result
   * Must be implemented by subclasses
   * @param params - The renderer parameters
   * @returns Metadata object specific to this renderer type
   */
  protected abstract getRendererSpecificMetadata(params: any): any;

  /**
   * Get the renderer type name (for logging and metadata)
   * Must be implemented by subclasses
   */
  protected abstract getRendererType(): string;
}
