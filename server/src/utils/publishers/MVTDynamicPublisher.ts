/**
 * MVT Dynamic Publisher - Independent module for publishing dynamic MVT services
 * 
 * Supports multiple input types:
 * - GeoJSON FeatureCollection (in-memory)
 * - GeoJSON file path
 * - PostGIS connection + table name or SQL query
 * 
 * Outputs dynamic MVT service with on-demand tile generation
 */

import geojsonvt from 'geojson-vt';
import vtPbf from 'vt-pbf';
import fs from 'fs';
import path from 'path';
import type { PoolConfig } from 'pg';
import { Pool } from 'pg';
import { wrapError } from '../../core';

// ============================================================================
// Type Definitions
// ============================================================================

export interface MVTTileOptions {
  minZoom?: number;
  maxZoom?: number;
  extent?: number;
  tolerance?: number;
  buffer?: number;
  layerName?: string;
  tilesetId?: string;  // Optional custom tileset ID
}

export interface PostGISConnectionInfo {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema?: string;  // Default: 'public'
}

export interface PostGISDataSource {
  type: 'postgis';
  connection: PostGISConnectionInfo;
  tableName?: string;      // Table name (mutually exclusive with sqlQuery)
  sqlQuery?: string;       // Custom SQL query (mutually exclusive with tableName)
  geometryColumn?: string; // Default: 'geom'
}

export interface GeoJSONFileSource {
  type: 'geojson-file';
  filePath: string;
}

export interface GeoJSONInMemorySource {
  type: 'geojson-memory';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  featureCollection: any;  // GeoJSON FeatureCollection
}

export type MVTSource = PostGISDataSource | GeoJSONFileSource | GeoJSONInMemorySource;

export interface MVTPublishResult {
  success: boolean;
  tilesetId: string;
  serviceUrl: string;       // URL template: /api/mvt/{tilesetId}/{z}/{x}/{y}.pbf
  metadata: MVTPublishMetadata;
  error?: string;
}

export interface MVTPublishMetadata {
  sourceType: 'postgis' | 'geojson-file' | 'geojson-memory';
  minZoom: number;
  maxZoom: number;
  extent: number;
  generatedAt: string;
  featureCount?: number;     // For GeoJSON
  tableName?: string;        // For PostGIS
  sqlQuery?: string;         // For PostGIS
  cacheEnabled: boolean;
}

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
// MVT Dynamic Publisher
// ============================================================================

export class MVTDynamicPublisher {
  private workspaceBase: string;
  private mvtOutputDir: string;
  private tileCache: TileCache;
  
  // Store tile indexes for GeoJSON sources (tilesetId -> tileIndex)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private geojsonTileIndexes: Map<string, any> = new Map();
  
  // Store PostGIS pools for PostGIS sources (tilesetId -> Pool)
  private postgisPools: Map<string, Pool> = new Map();
  
  // Store metadata for all published tilesets
  private tilesetMetadata: Map<string, MVTPublishMetadata> = new Map();

  // Singleton instance
  private static instance: MVTDynamicPublisher | null = null;

  /**
   * Get or create the singleton instance
   * @param workspaceBase - Workspace base directory (only used on first call)
   * @param cacheSize - Cache size (only used on first call)
   * @returns The singleton MVTDynamicPublisher instance
   */
  static getInstance(workspaceBase?: string, cacheSize: number = 10000): MVTDynamicPublisher {
    if (!MVTDynamicPublisher.instance) {
      if (!workspaceBase) {
        throw new Error('MVTDynamicPublisher not initialized. Call getInstance(workspaceBase) first.');
      }
      MVTDynamicPublisher.instance = new MVTDynamicPublisher(workspaceBase, cacheSize);
    }
    return MVTDynamicPublisher.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    MVTDynamicPublisher.instance = null;
  }

  private constructor(workspaceBase: string, cacheSize: number = 10000) {
    this.workspaceBase = workspaceBase;
    this.mvtOutputDir = path.join(workspaceBase, 'results', 'mvt-dynamic');
    this.tileCache = new InMemoryTileCache(cacheSize);
    
    // Ensure output directory exists
    if (!fs.existsSync(this.mvtOutputDir)) {
      fs.mkdirSync(this.mvtOutputDir, { recursive: true });
    }
    
    console.log('[MVT Dynamic Publisher] Initialized');
  }

  /**
   * Publish a dynamic MVT service from various source types
   */
  async publish(source: MVTSource, options: MVTTileOptions = {}, tilesetId?: string): Promise<MVTPublishResult> {
    try {
      console.log(`[MVT Dynamic Publisher] Publishing from source type: ${source.type}`);
      
      const {
        minZoom = 0,
        maxZoom = 14,
        extent = 4096,
        tolerance = 3,
        buffer = 64,
        layerName = 'default'
      } = options;

      let tilesetId: string;
      let metadata: MVTPublishMetadata;

      // Route to appropriate handler based on source type
      switch (source.type) {
        case 'geojson-memory':
          tilesetId = await this.publishGeoJSONInMemory(
            source.featureCollection,
            { minZoom, maxZoom, extent, tolerance, buffer, layerName },
            options.tilesetId  // Use custom tileset ID from options if provided
          );
          metadata = {
            sourceType: 'geojson-memory',
            minZoom,
            maxZoom,
            extent,
            generatedAt: new Date().toISOString(),
            featureCount: source.featureCollection.features?.length || 0,
            cacheEnabled: true
          };
          break;

        case 'geojson-file':
          tilesetId = await this.publishGeoJSONFile(
            source.filePath,
            { minZoom, maxZoom, extent, tolerance, buffer, layerName },
            options.tilesetId
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
          tilesetId = await this.publishPostGIS(
            source,
            { minZoom, maxZoom, extent, tolerance, buffer, layerName },
            options.tilesetId
          );
          metadata = {
            sourceType: 'postgis',
            minZoom,
            maxZoom,
            extent,
            generatedAt: new Date().toISOString(),
            tableName: source.tableName,
            sqlQuery: source.sqlQuery,
            cacheEnabled: true
          };
          break;

        default:
          throw new Error(`Unsupported source type: ${(source as any).type}`);
      }

      // Save metadata
      this.tilesetMetadata.set(tilesetId, metadata);
      this.saveMetadata(tilesetId, metadata);

      const serviceUrl = `/api/mvt/${tilesetId}/{z}/{x}/{y}.pbf`;

      console.log(`[MVT Dynamic Publisher] Published successfully: ${tilesetId}`);
      console.log(`[MVT Dynamic Publisher] Service URL: ${serviceUrl}`);

      return {
        success: true,
        tilesetId,
        serviceUrl,
        metadata
      };
    } catch (error) {
      console.error('[MVT Dynamic Publisher] Publication failed:', error);
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
      console.warn(`[MVT Dynamic Publisher] Tileset not found: ${tilesetId}`);
      return null;
    }

    let tileBuffer: Buffer | null = null;

    // Route to appropriate handler
    switch (metadata.sourceType) {
      case 'geojson-memory':
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
    console.log(`[MVT Dynamic Publisher] Deleting tileset: ${tilesetId}`);
    
    // Clean up GeoJSON tile index
    this.geojsonTileIndexes.delete(tilesetId);
    
    // Clean up PostGIS pool
    const pool = this.postgisPools.get(tilesetId);
    if (pool) {
      // pool.end() returns a Promise, but we don't need to wait for it during cleanup
      void pool.end();
      this.postgisPools.delete(tilesetId);
    }
    
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

  // ============================================================================
  // Private Methods - GeoJSON Handlers
  // ============================================================================

  private async publishGeoJSONInMemory(
    featureCollection: any,
    options: MVTTileOptions,
    customTilesetId?: string
  ): Promise<string> {
    console.log('[MVT Dynamic Publisher] Creating tile index from in-memory GeoJSON');
    
    if (!featureCollection || featureCollection.type !== 'FeatureCollection') {
      throw new Error('Input must be a valid GeoJSON FeatureCollection');
    }

    const tilesetId = customTilesetId || this.generateTilesetId('geojson');
    
    // Create tile index using geojson-vt
    const tileIndex = geojsonvt(featureCollection, {
      maxZoom: options.maxZoom,
      extent: options.extent,
      tolerance: options.tolerance,
      buffer: options.buffer
    });

    // Cache the tile index
    this.geojsonTileIndexes.set(tilesetId, tileIndex);

    console.log(`[MVT Dynamic Publisher] GeoJSON tile index created: ${tilesetId}`);
    console.log(`[MVT Dynamic Publisher] Features: ${featureCollection.features?.length || 0}`);

    return tilesetId;
  }

  private async publishGeoJSONFile(
    filePath: string,
    options: MVTTileOptions,
    customTilesetId?: string
  ): Promise<string> {
    console.log(`[MVT Dynamic Publisher] Loading GeoJSON file: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`GeoJSON file not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const featureCollection = JSON.parse(fileContent);

    return this.publishGeoJSONInMemory(featureCollection, options, customTilesetId);
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
      console.warn(`[MVT Dynamic Publisher] Tile index not found: ${tilesetId}`);
      return null;
    }

    // Get tile from index
    const tile = tileIndex.getTile(z, x, y);
    
    if (!tile || !tile.features || tile.features.length === 0) {
      return null;  // Empty tile
    }

    // Convert to PBF
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

  private async publishPostGIS(
    source: PostGISDataSource,
    options: MVTTileOptions,
    customTilesetId?: string
  ): Promise<string> {
    console.log('[MVT Dynamic Publisher] Setting up PostGIS MVT service');
    
    if (!source.tableName && !source.sqlQuery) {
      throw new Error('PostGIS source must provide either tableName or sqlQuery');
    }

    const tilesetId = customTilesetId || this.generateTilesetId('postgis');
    
    // Create connection pool
    const poolConfig: PoolConfig = {
      host: source.connection.host,
      port: source.connection.port,
      database: source.connection.database,
      user: source.connection.user,
      password: source.connection.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    const pool = new Pool(poolConfig);
    
    // Test connection
    try {
      await pool.query('SELECT 1');
      console.log('[MVT Dynamic Publisher] PostGIS connection established');
    } catch (error) {
      throw wrapError(error, 'Failed to connect to PostGIS');
    }

    // Store pool for later use
    this.postgisPools.set(tilesetId, pool);

    console.log(`[MVT Dynamic Publisher] PostGIS tileset created: ${tilesetId}`);
    console.log(`[MVT Dynamic Publisher] Source: ${source.tableName || 'Custom SQL'}`);

    return tilesetId;
  }

  private async getPostGISTile(
    tilesetId: string,
    z: number,
    x: number,
    y: number,
    metadata: MVTPublishMetadata
  ): Promise<Buffer | null> {
    const pool = this.postgisPools.get(tilesetId);
    
    if (!pool) {
      console.warn(`[MVT Dynamic Publisher] PostGIS pool not found: ${tilesetId}`);
      return null;
    }

    const extent = metadata.extent || 4096;
    const geometryColumn = 'geom';  // TODO: Make configurable
    
    let query: string;
    let params: any[];

    if (metadata.tableName) {
      // Use table name
      const schema = 'public';  // TODO: Make configurable
      query = `
        SELECT ST_AsMVT(q, $1, $2, 'geom') as tile
        FROM (
          SELECT ${geometryColumn}
          FROM ${schema}.${metadata.tableName}
          WHERE ST_Intersects(${geometryColumn}, ST_TileEnvelope($3, $4, $5))
        ) q
      `;
      params = [extent, 'default', z, x, y];
    } else if (metadata.sqlQuery) {
      // Use custom SQL query
      query = `
        SELECT ST_AsMVT(q, $1, $2, 'geom') as tile
        FROM (
          ${metadata.sqlQuery}
        ) q
        WHERE ST_Intersects(geom, ST_TileEnvelope($3, $4, $5))
      `;
      params = [extent, 'default', z, x, y];
    } else {
      throw new Error('Invalid PostGIS metadata');
    }

    try {
      const result = await pool.query(query, params);
      
      if (result.rows.length === 0 || !result.rows[0].tile) {
        return null;  // Empty tile
      }

      return result.rows[0].tile;
    } catch (error) {
      console.error('[MVT Dynamic Publisher] PostGIS tile query failed:', error);
      return null;
    }
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private generateTilesetId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private saveMetadata(tilesetId: string, metadata: MVTPublishMetadata): void {
    const tilesetDir = path.join(this.mvtOutputDir, tilesetId);
    
    if (!fs.existsSync(tilesetDir)) {
      fs.mkdirSync(tilesetDir, { recursive: true });
    }

    const metadataPath = path.join(tilesetDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Get the singleton MVTDynamicPublisher instance
 * @param workspaceBase - Workspace base directory (required on first call)
 * @param cacheSize - Cache size in number of tiles (default: 10000)
 * @returns The singleton MVTDynamicPublisher instance
 * 
 * @example
 * ```typescript
 * // Initialize during app startup
 * const publisher = getMVTPublisher('/path/to/workspace', 10000);
 * 
 * // Use elsewhere without parameters
 * const publisher = getMVTPublisher();
 * ```
 */
export function getMVTPublisher(workspaceBase?: string, cacheSize: number = 10000): MVTDynamicPublisher {
  return MVTDynamicPublisher.getInstance(workspaceBase, cacheSize);
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetMVTPublisher(): void {
  MVTDynamicPublisher.resetInstance();
}
