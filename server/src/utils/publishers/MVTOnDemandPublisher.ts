/**
 * MVT On-Demand Publisher - Generates tiles on-demand without pre-generation
 * 
 * Supports multiple input types:
 * - GeoJSON FeatureCollection (in-memory)
 * - GeoJSON file path
 * - PostGIS connection + table name or SQL query
 * 
 * Outputs dynamic MVT service with on-demand tile generation
 * Ideal for large datasets and frequently updated data sources
 */

import geojsonvt from 'geojson-vt';
import vtPbf from 'vt-pbf';
import fs from 'fs';
import path from 'path';
import { wrapError } from '../../core';
import { BaseMVTPublisher } from './base/BaseMVTPublisher';
import { PostGISTileGenerator } from './base/PostGISTileGenerator';
import {
  type MVTTileOptions,
  type PostGISDataSource,
  type MVTSource,
  type MVTPublishMetadata,
  type MVTPublishResult
} from './base/MVTPublisherTypes';

// ============================================================================
// Tile Cache Interface
// ============================================================================

export interface TileCache {
  get(key: string): Buffer | null;
  set(key: string, data: Buffer): void;
  has(key: string): boolean;
  clear(): void;
}

// Simple in-memory cache implementation
class InMemoryTileCache implements TileCache {
  private cache: Map<string, Buffer> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
  }

  get(key: string): Buffer | null {
    return this.cache.get(key) || null;
  }

  set(key: string, data: Buffer): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry (simple LRU approximation)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, data);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// MVT On-Demand Publisher
// ============================================================================

export class MVTOnDemandPublisher extends BaseMVTPublisher {
  private tileCache: TileCache;
  
  // Store tile indexes for GeoJSON sources (tilesetId -> tileIndex)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private geojsonTileIndexes: Map<string, any> = new Map();
  
  // Store PostGIS connection configs for PostGIS sources (tilesetId -> config)
  private postgisConfigs: Map<string, PostGISDataSource> = new Map();
  
  // PostGIS tile generator instance
  private postgisGenerator: PostGISTileGenerator = new PostGISTileGenerator();
  
  // Store metadata for all published tilesets
  private tilesetMetadata: Map<string, MVTPublishMetadata> = new Map();

  // Singleton instance
  private static instance: MVTOnDemandPublisher | null = null;

  /**
   * Get or create the singleton instance
   * @param workspaceBase - Workspace base directory (only used on first call)
   * @param cacheSize - Cache size (only used on first call)
   * @returns The singleton MVTOnDemandPublisher instance
   */
  static getInstance(workspaceBase?: string, cacheSize: number = 10000): MVTOnDemandPublisher {
    if (!MVTOnDemandPublisher.instance) {
      if (!workspaceBase) {
        throw new Error('MVTOnDemandPublisher not initialized. Call getInstance(workspaceBase) first.');
      }
      MVTOnDemandPublisher.instance = new MVTOnDemandPublisher(workspaceBase, cacheSize);
    }
    return MVTOnDemandPublisher.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    MVTOnDemandPublisher.instance = null;
  }

  private constructor(workspaceBase: string, cacheSize: number = 10000) {
    super(workspaceBase, 'mvt');  // Only pass subdirectory name, base class adds 'results/'
    this.tileCache = new InMemoryTileCache(cacheSize);
    
    // Load existing MVT services from disk into cache
    void this.loadExistingServices();
    
    console.log('[MVT On-Demand Publisher] Initialized');
  }

  /**
   * Load existing MVT services from disk into memory cache
   * This ensures services persist across server restarts
   */
  private async loadExistingServices(): Promise<void> {
    try {
      console.log(`[MVT On-Demand Publisher] Checking for existing services in: ${this.mvtOutputDir}`);
      
      if (!fs.existsSync(this.mvtOutputDir)) {
        console.log(`[MVT On-Demand Publisher] Directory does not exist: ${this.mvtOutputDir}`);
        return;
      }
      
      const entries = fs.readdirSync(this.mvtOutputDir, { withFileTypes: true });
      console.log(`[MVT On-Demand Publisher] Found ${entries.length} entries in directory`);
      
      let loadedCount = 0;
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metadataPath = path.join(this.mvtOutputDir, entry.name, 'metadata.json');
          if (fs.existsSync(metadataPath)) {
            try {
              const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
              
              // Restore tileset metadata
              this.tilesetMetadata.set(entry.name, metadata);
              
              // For GeoJSON file sources, we need to reload the tile index
              if (metadata.sourceType === 'geojson-file' && metadata.filePath) {
                // Note: We don't preload the tile index here to avoid memory overhead
                // It will be lazily loaded when the first tile is requested
                console.log(`[MVT On-Demand Publisher] Found GeoJSON tileset: ${entry.name}`);
              } else if (metadata.sourceType === 'postgis') {
                console.log(`[MVT On-Demand Publisher] Found PostGIS tileset: ${entry.name}`);
              }
              
              loadedCount++;
            } catch (error) {
              console.error(`[MVT On-Demand Publisher] Failed to load tileset ${entry.name}:`, error);
            }
          }
        }
      }
      
      if (loadedCount > 0) {
        console.log(`[MVT On-Demand Publisher] Loaded ${loadedCount} existing tilesets from disk`);
      } else {
        console.log(`[MVT On-Demand Publisher] No tilesets found to load`);
      }
    } catch (error) {
      console.error('[MVT On-Demand Publisher] Failed to load existing services:', error);
    }
  }

  /**
   * Publish a dynamic MVT service from various source types
   */
  async publish(source: MVTSource, options: MVTTileOptions = {}, _tilesetId?: string): Promise<MVTPublishResult> {
    try {
      console.log(`[MVT On-Demand Publisher] Publishing from source type: ${source.type}`);
      
      const {
        minZoom = 0,
        maxZoom = 22,
        extent = 4096,
        tolerance = 3,
        buffer = 64,
        layerName = 'default'
      } = options;

      // Generate tilesetId using base class method
      const tilesetId = options.tilesetId || this.generateTilesetId(source.type);

      let config: any;
      let metadata: MVTPublishMetadata;

      // Route to appropriate handler based on source type
      switch (source.type) {
        case 'geojson-file':
          config = await this.prepareGeoJSONFile(
            source.filePath,
            { minZoom, maxZoom, extent, tolerance, buffer, layerName }
          );
          metadata = {
            sourceType: 'geojson-file',
            minZoom,
            maxZoom,
            extent,
            generatedAt: new Date().toISOString(),
            cacheEnabled: true
          };
          break;

        case 'postgis':
          config = await this.preparePostGIS(
            source,
            { minZoom, maxZoom, extent, tolerance, buffer, layerName }
          );
          metadata = {
            sourceType: 'postgis',
            minZoom,
            maxZoom,
            extent,
            generatedAt: new Date().toISOString(),
            tableName: source.tableName,
            sqlQuery: source.sqlQuery,
            schema: source.connection.schema || 'public',
            geometryColumn: source.geometryColumn || 'geom',
            layerName: layerName,
            cacheEnabled: true
          };
          break;

        default:
          throw new Error(`Unsupported source type: ${(source as Record<string, unknown>).type}`);
      }

      // Save metadata using base class method (which also caches in memory)
      this.saveMetadata(tilesetId, metadata);

      // Cache the configuration for on-demand tile generation
      if (source.type === 'geojson-file' && config.tileIndex) {
        this.geojsonTileIndexes.set(tilesetId, config.tileIndex);
      } else if (source.type === 'postgis' && config.dataSource) {
        this.postgisConfigs.set(tilesetId, config.dataSource);
      }

      const serviceUrl = `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`;

      console.log(`[MVT On-Demand Publisher] Published successfully: ${tilesetId}`);
      console.log(`[MVT On-Demand Publisher] Service URL: ${serviceUrl}`);

      return {
        success: true,
        tilesetId,
        serviceUrl,
        metadata
      };
    } catch (error) {
      console.error('[MVT On-Demand Publisher] Publication failed:', error);
      return {
        success: false,
        tilesetId: '',
        serviceUrl: '',
        metadata: {} as MVTPublishMetadata,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get a single tile on-demand
   */
  async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
    const cacheKey = `${tilesetId}/${z}/${x}/${y}`;
    
    // Check cache first
    const cached = this.tileCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Get metadata to determine source type
    const metadata = this.tilesetMetadata.get(tilesetId);
    if (!metadata) {
      console.warn(`[MVT On-Demand Publisher] Tileset not found: ${tilesetId}`);
      return null;
    }

    let tileBuffer: Buffer | null = null;

    // Route to appropriate handler
    switch (metadata.sourceType) {
      case 'geojson-file':
        tileBuffer = this.getGeoJSONTile(tilesetId, z, x, y, metadata.extent);
        break;

      case 'postgis':
        tileBuffer = await this.getPostGISTile(tilesetId, z, x, y, metadata);
        break;
    }

    // Cache the result if successful
    if (tileBuffer) {
      this.tileCache.set(cacheKey, tileBuffer);
    }

    return tileBuffer;
  }

  /**
   * Delete a published tileset and clean up resources
   */
  deleteTileset(tilesetId: string): boolean {
    console.log(`[MVT On-Demand Publisher] Deleting tileset: ${tilesetId}`);
    
    // Clean up GeoJSON tile index
    this.geojsonTileIndexes.delete(tilesetId);
    
    // Clean up PostGIS config (pool lifecycle managed by PostGISPoolManager)
    this.postgisConfigs.delete(tilesetId);
    
    // Clean up cache
    this.tilesetMetadata.delete(tilesetId);
    
    // Remove metadata file
    const metadataPath = path.join(this.mvtOutputDir, tilesetId, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      fs.rmSync(path.join(this.mvtOutputDir, tilesetId), { recursive: true, force: true });
    }
    
    return true;
  }

  /**
   * List all published tilesets
   */
  listTilesets(): Array<{ tilesetId: string; metadata: MVTPublishMetadata }> {
    const result: Array<{ tilesetId: string; metadata: MVTPublishMetadata }> = [];
    
    this.tilesetMetadata.forEach((metadata, tilesetId) => {
      result.push({ tilesetId, metadata });
    });
    
    return result;
  }

  /**
   * Get tileset metadata
   */
  getMetadata(tilesetId: string): MVTPublishMetadata | null {
    return this.tilesetMetadata.get(tilesetId) || null;
  }

  // ============================================================================
  // Private Methods - GeoJSON Handlers
  // ============================================================================

  /**
   * Prepare GeoJSON file for on-demand tile generation
   * Returns configuration (tile index) instead of tilesetId
   */
  private async prepareGeoJSONFile(
    filePath: string,
    options: MVTTileOptions
  ): Promise<any> {
    console.log(`[MVT On-Demand Publisher] Loading GeoJSON file: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`GeoJSON file not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const featureCollection = JSON.parse(fileContent);

    return this.prepareGeoJSONInMemory(featureCollection, options);
  }

  /**
   * Prepare in-memory GeoJSON for on-demand tile generation
   * Returns configuration (tile index) instead of tilesetId
   */
  private prepareGeoJSONInMemory(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    featureCollection: any,
    options: MVTTileOptions
  ): any {
    console.log('[MVT On-Demand Publisher] Creating tile index from in-memory GeoJSON');
    
    if (!featureCollection || featureCollection.type !== 'FeatureCollection') {
      throw new Error('Input must be a valid GeoJSON FeatureCollection');
    }

    // Create tile index using geojson-vt
    const tileIndex = geojsonvt(featureCollection, {
      maxZoom: options.maxZoom,
      extent: options.extent,
      tolerance: options.tolerance,
      buffer: options.buffer
    });

    console.log(`[MVT On-Demand Publisher] GeoJSON tile index created`);
    console.log(`[MVT On-Demand Publisher] Features: ${featureCollection.features?.length || 0}`);

    // Return configuration (Publisher will handle caching)
    return {
      tileIndex,
      options: {
        minZoom: options.minZoom,
        maxZoom: options.maxZoom,
        extent: options.extent,
        tolerance: options.tolerance,
        buffer: options.buffer
      }
    };
  }

  private getGeoJSONTile(
    tilesetId: string,
    z: number,
    x: number,
    y: number,
    extent: number
  ): Buffer | null {
    const tileIndex = this.geojsonTileIndexes.get(tilesetId);
    
    if (!tileIndex) {
      console.warn(`[MVT On-Demand Publisher] Tile index not found: ${tilesetId}`);
      return null;
    }

    // Get tile from index
    const tile = tileIndex.getTile(z, x, y);
    
    if (!tile || !tile.features || tile.features.length === 0) {
      return null;  // Empty tile
    }

    // Convert to PBF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layers: any = {};
    layers['default'] = {
      features: tile.features,
      extent: extent,
      version: 2
    };

    const pbf = vtPbf.fromGeojsonVt(layers, { version: 2, extent });
    
    return Buffer.from(pbf);
  }

  // ============================================================================
  // Private Methods - PostGIS Handlers
  // ============================================================================

  /**
   * Prepare PostGIS data source for on-demand tile generation
   * Returns configuration (connection info) instead of tilesetId
   */
  private async preparePostGIS(
    source: PostGISDataSource,
    _options: MVTTileOptions
  ): Promise<any> {
    console.log('[MVT On-Demand Publisher] Setting up PostGIS MVT service');
    
    if (!source.tableName && !source.sqlQuery) {
      throw new Error('PostGIS source must provide either tableName or sqlQuery');
    }

    // Create connection pool using PostGISTileGenerator (delegates to PostGISPoolManager)
    try {
      await this.postgisGenerator.createPool(source.connection);
      console.log('[MVT On-Demand Publisher] PostGIS connection established');
    } catch (error) {
      throw wrapError(error, 'Failed to connect to PostGIS');
    }

    console.log(`[MVT On-Demand Publisher] PostGIS tileset setup complete`);
    console.log(`[MVT On-Demand Publisher] Source: ${source.tableName || 'Custom SQL'}`);

    // Return configuration (Publisher will handle caching)
    return {
      dataSource: source
    };
  }

  private async getPostGISTile(
    tilesetId: string,
    z: number,
    x: number,
    y: number,
    metadata: MVTPublishMetadata
  ): Promise<Buffer | null> {
    const source = this.postgisConfigs.get(tilesetId);
    
    if (!source) {
      console.warn(`[MVT On-Demand Publisher] PostGIS config not found: ${tilesetId}`);
      return null;
    }

    const extent = metadata.extent || 4096;
    const geometryColumn = metadata.geometryColumn || 'geom';
    const schema = metadata.schema || 'public';
    const layerName = metadata.layerName || source.tableName || 'default_layer';

    try {
      console.log(`[MVT On-Demand Publisher] Generating tile ${z}/${x}/${y} from PostGIS`);
      
      // Get pool from PostGISPoolManager via PostGISTileGenerator
      const pool = await this.postgisGenerator.createPool(source.connection);
      
      // Generate tile using shared PostGISTileGenerator
      const result = await this.postgisGenerator.generateTile(
        pool,
        z,
        x,
        y,
        {
          tableName: source.tableName,
          sqlQuery: source.sqlQuery,
          geometryColumn: geometryColumn
        },
        {
          extent: extent,
          layerName: layerName,
          schema: schema
        }
      );
      
      if (!result.success) {
        console.error('[MVT On-Demand Publisher] PostGIS tile generation failed:', result.error);
        return null;
      }

      if (!result.tileBuffer) {
        console.log(`[MVT On-Demand Publisher] Empty tile for ${z}/${x}/${y}`);
        return null;
      }

      const tileSize = result.tileBuffer.length;
      console.log(`[MVT On-Demand Publisher] Tile size: ${tileSize} bytes for ${z}/${x}/${y}`);
      
      return result.tileBuffer;
    } catch (error) {
      console.error('[MVT On-Demand Publisher] PostGIS tile query failed:', error);
      return null;
    }
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  // Note: generateTilesetId() and saveMetadata() are now provided by BaseMVTPublisher
  // Override saveMetadata to add memory caching
  protected saveMetadata(tilesetId: string, metadata: MVTPublishMetadata): void {
    // Call base class to save to disk
    super.saveMetadata(tilesetId, metadata);
    
    // Also cache in memory for faster access
    this.tilesetMetadata.set(tilesetId, metadata);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Get the singleton MVTOnDemandPublisher instance
 * @param workspaceBase - Workspace base directory (required on first call)
 * @param cacheSize - Cache size in number of tiles (default: 10000)
 * @returns The singleton MVTOnDemandPublisher instance
 * 
 * @example
 * ```typescript
 * // Initialize during app startup
 * const publisher = getMVTOnDemandPublisher('/path/to/workspace', 10000);
 * 
 * // Use elsewhere without parameters
 * const publisher = getMVTOnDemandPublisher();
 * ```
 */
export function getMVTOnDemandPublisher(workspaceBase?: string, cacheSize: number = 10000): MVTOnDemandPublisher {
  return MVTOnDemandPublisher.getInstance(workspaceBase, cacheSize);
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetMVTOnDemandPublisher(): void {
  MVTOnDemandPublisher.resetInstance();
}
