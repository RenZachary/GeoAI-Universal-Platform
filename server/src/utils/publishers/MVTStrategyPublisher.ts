/**
 * MVT Strategy Publisher - Generates Mapbox Vector Tiles using strategy pattern
 * Supports multiple data source types with optimized generation methods
 * 
 * Ideal for plugin workflows and integration with NativeData/DataAccessor
 */

import geojsonvt from 'geojson-vt';
import vtPbf from 'vt-pbf';
import fs from 'fs';
import path from 'path';
import type { DataSourceType, NativeData } from '../../core/index';
import { DataAccessorFactory } from '../../data-access';
import type Database from 'better-sqlite3';
import { BaseMVTPublisher, type MVTPublishResult } from './base/BaseMVTPublisher';
import type { Pool } from 'pg';
import { PostGISTileGenerator, type PostGISTileQuery } from './base/PostGISTileGenerator';
import { PostGISConnectionManager } from '../PostGISConnectionManager';
import type { PostGISConnectionConfig } from '../../core';
import { type MVTTileOptions, type MVTPublishMetadata } from './base/MVTPublisherTypes';
import { SQLiteManagerInstance } from '../../storage';
import { DataSourceRepository } from '../../data-access/repositories';

// Type definitions for geojson-vt (library doesn't provide types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeoJSONVT = any;

/**
 * Strategy interface for MVT tile generation
 */
export interface MVTTileGenerationStrategy {
  /**
   * Generate MVT tiles from a data source
   * @param sourceReference - Data source reference (file path, table name, etc.)
   * @param dataSourceType - Type of data source
   * @param options - Tile generation options
   * @returns tilesetId - Unique identifier for the generated tileset
   */
  generateTiles(
    sourceReference: string,
    dataSourceType: DataSourceType,
    nativeData: NativeData,
    options: MVTTileOptions
  ): Promise<string>;
  
  /**
   * Get a single tile on-demand (for dynamic generation)
   * @param tilesetId - Tileset identifier
   * @param z - Zoom level
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns PBF buffer or null if tile doesn't exist
   */
  getTile?(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null>;
}

/**
 * GeoJSON MVT Strategy - Uses geojson-vt library
 * Generates tiles on-demand from cached tile index
 */
class GeoJSONMVTTStrategy implements MVTTileGenerationStrategy {
  // Cache for tile indexes (tilesetId -> tileIndex)
  private tileIndexCache: Map<string, GeoJSONVT> = new Map();
  
  constructor(private mvtOutputDir: string) {}

  async generateTiles(
    sourceReference: string,
    dataSourceType: DataSourceType,
    nativeData: NativeData,
    options: MVTTileOptions
  ): Promise<string> {
    const {
      minZoom = 0,
      maxZoom = 22,
      extent = 4096,
      tolerance = 3,
      buffer = 64
    } = options;

    console.log('[GeoJSON MVT Strategy] Creating tile index for on-demand generation');
    
    // Read GeoJSON file
    if (!fs.existsSync(sourceReference)) {
      throw new Error(`GeoJSON file not found: ${sourceReference}`);
    }
    
    const fileContent = fs.readFileSync(sourceReference, 'utf-8');
    const featureCollection = JSON.parse(fileContent);
    
    if (!featureCollection || featureCollection.type !== 'FeatureCollection') {
      throw new Error('Input must be a valid GeoJSON FeatureCollection');
    }
    
    const featureCount = featureCollection.features?.length || 0;
    console.log(`[GeoJSON MVT Strategy] Processing ${featureCount} features`);
    
    // Create tile index using geojson-vt
    const tileIndex = geojsonvt(featureCollection, {
      maxZoom,
      extent,
      tolerance,
      buffer
    });
    
    // Generate a unique ID for this tile set
    const tilesetId = `mvt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tilesetDir = path.join(this.mvtOutputDir, tilesetId);

    if (!fs.existsSync(tilesetDir)) {
      fs.mkdirSync(tilesetDir, { recursive: true });
    }
    
    // Cache the tile index for on-demand access
    this.tileIndexCache.set(tilesetId, {
      tileIndex,
      options: { minZoom, maxZoom, extent, tolerance, buffer },
      sourceReference,
      createdAt: Date.now()
    });
    
    console.log('[GeoJSON MVT Strategy] On-demand mode enabled. Tiles will be generated when requested.');

    // Create tileset metadata
    const metadata = {
      id: tilesetId,
      minZoom,
      maxZoom,
      extent,
      generatedAt: new Date().toISOString(),
      format: 'pbf',
      strategy: 'geojson',  // Must match the registered strategy key
      sourceFile: sourceReference,
      featureCount
    };

    const metadataPath = path.join(tilesetDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(`[GeoJSON MVT Strategy] Tileset created: ${tilesetId}`);

    return tilesetId;
  }
  
  /**
   * Get a single tile on-demand
   */
  async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
    console.log(`[GeoJSON MVT Strategy] getTile called: ${tilesetId}/${z}/${x}/${y}`);
    console.log(`[GeoJSON MVT Strategy] Cache size: ${this.tileIndexCache.size}`);
    
    let cached = this.tileIndexCache.get(tilesetId);
    
    // If not in cache, load from source file
    if (!cached) {
      console.log(`[GeoJSON MVT Strategy] Tileset not in cache, loading from source...`);
      
      // Read metadata to get source file path
      const tilesetDir = path.join(this.mvtOutputDir, tilesetId);
      const metadataPath = path.join(tilesetDir, 'metadata.json');
      
      if (!fs.existsSync(metadataPath)) {
        console.warn(`[GeoJSON MVT Strategy] Metadata not found: ${metadataPath}`);
        return null;
      }
      
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      const sourceFile = metadata.sourceFile;
      
      if (!sourceFile || !fs.existsSync(sourceFile)) {
        console.warn(`[GeoJSON MVT Strategy] Source file not found: ${sourceFile}`);
        return null;
      }
      
      console.log(`[GeoJSON MVT Strategy] Loading GeoJSON from: ${sourceFile}`);
      
      try {
        // Read and parse GeoJSON
        const fileContent = fs.readFileSync(sourceFile, 'utf-8');
        const featureCollection = JSON.parse(fileContent);
        
        if (!featureCollection || featureCollection.type !== 'FeatureCollection') {
          console.warn('[GeoJSON MVT Strategy] Invalid GeoJSON format');
          return null;
        }
        
        console.log(`[GeoJSON MVT Strategy] Creating tileIndex for ${featureCollection.features?.length || 0} features`);
        
        // Create tile index
        const tileIndex = geojsonvt(featureCollection, {
          maxZoom: metadata.maxZoom || 22,
          extent: metadata.extent || 4096,
          tolerance: 3,
          buffer: 64
        });
        
        // Cache the tile index
        cached = { tileIndex, options: metadata };
        this.tileIndexCache.set(tilesetId, cached);
        
        console.log(`[GeoJSON MVT Strategy] TileIndex created and cached for: ${tilesetId}`);
      } catch (error) {
        console.error('[GeoJSON MVT Strategy] Failed to load source file:', error);
        return null;
      }
    }
    
    console.log(`[GeoJSON MVT Strategy] Found cached tileIndex for: ${tilesetId}`);
    
    const { tileIndex, options } = cached;
    const { extent = 4096 } = options;
    
    // Check if zoom level is within range
    if (z < options.minZoom || z > options.maxZoom) {
      console.log(`[GeoJSON MVT Strategy] Zoom ${z} out of range [${options.minZoom}, ${options.maxZoom}]`);
      return null;
    }
    
    // Get tile from index
    const tile = tileIndex.getTile(z, x, y);
    
    if (!tile || !tile.features || tile.features.length === 0) {
      console.log(`[GeoJSON MVT Strategy] Empty tile at ${z}/${x}/${y}`);
      return null;  // Empty tile
    }
    
    console.log(`[GeoJSON MVT Strategy] Generating PBF for tile with ${tile.features.length} features`);
    
    // Convert to PBF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layers: any = {};
    layers['default'] = {
      features: tile.features,
      extent: extent,
      version: 2
    };
    
    const pbf = vtPbf.fromGeojsonVt(layers, { version: 2, extent });
    
    console.log(`[GeoJSON MVT Strategy] Generated PBF buffer size: ${pbf.length} bytes`);
    
    return Buffer.from(pbf);
  }
}

/**
 * Shapefile MVT Strategy - Converts to GeoJSON first, then uses geojson-vt
 */
class ShapefileMVTTStrategy implements MVTTileGenerationStrategy {
  constructor(private mvtOutputDir: string) {}

  async generateTiles(
    sourceReference: string,
    dataSourceType: DataSourceType,
    nativeData: NativeData,
    options: MVTTileOptions
  ): Promise<string> {
    console.log('[Shapefile MVT Strategy] Converting Shapefile to GeoJSON...');
    
    // Use DataAccessor to read Shapefile and convert to GeoJSON
    const factory = new DataAccessorFactory();
    const accessor = factory.createAccessor('shapefile');
    
    // Read the shapefile using the public read() method
    await accessor.read(sourceReference);
    
    // The reference should point to a .shp file, we need to convert it to GeoJSON
    // Since loadGeoJSON is protected, we'll use shapefile library directly
    const shapefilePath = sourceReference.replace('.shp', '');
    const shapefileModule = await import('shapefile');
    const source = await shapefileModule.open(shapefilePath);
    
    const features = [];
    let result;
    while (!(result = await source.read()).done) {
      if (result.value) {
        features.push(result.value);
      }
    }
    
    const geojson = {
      type: 'FeatureCollection',
      features: features
    };
    
    console.log(`[Shapefile MVT Strategy] Converted to GeoJSON with ${geojson.features?.length || 0} features`);
    
    // Generate tilesetId first so we can save the converted GeoJSON in its directory
    const tilesetId = `mvt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tilesetDir = path.join(this.mvtOutputDir, tilesetId);
    
    if (!fs.existsSync(tilesetDir)) {
      fs.mkdirSync(tilesetDir, { recursive: true });
    }
    
    // Save the converted GeoJSON in the tileset directory (persistent, needed for on-demand generation)
    const convertedGeoJsonPath = path.join(tilesetDir, 'source.geojson');
    fs.writeFileSync(convertedGeoJsonPath, JSON.stringify(geojson), 'utf-8');
    console.log(`[Shapefile MVT Strategy] Saved converted GeoJSON to: ${convertedGeoJsonPath}`);
    
    // Delegate to GeoJSON strategy
    const geojsonStrategy = new GeoJSONMVTTStrategy(this.mvtOutputDir);
    
    try {
      // Generate tiles from the converted GeoJSON file
      return await geojsonStrategy.generateTiles(convertedGeoJsonPath, 'geojson', nativeData, options);
    } catch (error) {
      // Only clean up if tile generation failed
      if (fs.existsSync(convertedGeoJsonPath)) {
        fs.unlinkSync(convertedGeoJsonPath);
        console.log('[Shapefile MVT Strategy] Cleaned up converted GeoJSON file after error');
      }
      throw error;
    }
    // Note: Do NOT delete convertedGeoJsonPath on success - it's needed for on-demand tile generation
  }
}

/**
 * PostGIS MVT Strategy - Uses ST_AsMVT() SQL function (most efficient)
 * Generates tiles on-demand using PostGIS native MVT support
 */
class PostGISMVTTStrategy implements MVTTileGenerationStrategy {
  private tileIndexCache: Map<string, GeoJSONVT> = new Map();
  private postgisPools: Map<string, Pool> = new Map();
  private tileGenerator: PostGISTileGenerator;
  
  constructor(
    private mvtOutputDir: string,
    private db: Database.Database
  ) {
    this.tileGenerator = new PostGISTileGenerator();
  }

  async generateTiles(
    sourceReference: string,
    dataSourceType: DataSourceType,
    nativeData: NativeData,
    options: MVTTileOptions
  ): Promise<string> {
    console.log('[PostGIS MVT Strategy] Setting up PostGIS MVT generation...');
    console.log(`[PostGIS MVT Strategy] Source reference: ${sourceReference}`);
    
    const {
      minZoom = 0,
      maxZoom = 22,
      extent = 4096,
      tolerance = 3,
      buffer = 64,
      layerName = 'default'
    } = options;
    
    // Generate a unique ID for this tileset
    const tilesetId = `mvt_postgis_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tilesetDir = path.join(this.mvtOutputDir, tilesetId);

    if (!fs.existsSync(tilesetDir)) {
      fs.mkdirSync(tilesetDir, { recursive: true });
    }
    // 通过db查询metadata字段
    const dsr = new DataSourceRepository(this.db).getByReferenceAndType(sourceReference, dataSourceType);
    const metadataInDb = dsr?.metadata;
    console.log('[PostGIS MVT Strategy] Metadata from DB:', metadataInDb);
    
    // Use the new Connection Manager to parse reference and get config
    const connectionInfo = PostGISConnectionManager.parseReference(sourceReference, metadataInDb);
    
    if (!connectionInfo) {
      throw new Error('Invalid PostGIS connection reference format');
    }
    
    // Create connection pool using shared manager
    const poolConfig: PostGISConnectionConfig = {
      host: connectionInfo.host,
      port: connectionInfo.port,
      database: connectionInfo.database,
      user: connectionInfo.user,
      password: connectionInfo.password,
      schema: connectionInfo.schema
    };
    
    const pool = await this.tileGenerator.createPool(poolConfig);
    
    // Store pool for later use
    this.postgisPools.set(tilesetId, pool);
    
    // Cache the connection info for on-demand tile generation
    this.tileIndexCache.set(tilesetId, {
      connectionInfo,
      options: { minZoom, maxZoom, extent, tolerance, buffer, layerName },
      createdAt: Date.now()
    });
    
    // Create tileset metadata
    const metadata = {
      id: tilesetId,
      minZoom,
      maxZoom,
      extent,
      generatedAt: new Date().toISOString(),
      format: 'pbf',
      strategy: 'postgis',  // Must match the registered strategy key
      sourceReference,
      layerName,
      connectionHost: connectionInfo.host,
      connectionDatabase: connectionInfo.database
    };

    const metadataPath = path.join(tilesetDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(`[PostGIS MVT Strategy] Tileset created: ${tilesetId}`);
    console.log(`[PostGIS MVT Strategy] Using on-demand generation with ST_AsMVT()`);

    return tilesetId;
  }
  
  /**
   * Get a single tile on-demand using PostGIS ST_AsMVT()
   */
  async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
    const cached = this.tileIndexCache.get(tilesetId);
    
    if (!cached) {
      console.warn(`[PostGIS MVT Strategy] Tileset not found in cache: ${tilesetId}`);
      return null;
    }
    
    const { connectionInfo, options } = cached;
    const { layerName = 'default', extent = 4096 } = options;
    
    // Get pool from cache
    const pool = this.postgisPools.get(tilesetId);
    if (!pool) {
      console.warn(`[PostGIS MVT Strategy] PostGIS pool not found: ${tilesetId}`);
      return null;
    }
    
    try {
      // Build query using shared generator
      const query: PostGISTileQuery = {
        tableName: connectionInfo.tableName,
        sqlQuery: connectionInfo.sqlQuery,
        geometryColumn: connectionInfo.geometryColumn
      };
      
      const result = await this.tileGenerator.generateTile(
        pool,
        z, x, y,
        query,
        {
          extent,
          layerName,
          schema: connectionInfo.schema
        }
      );
      
      if (!result.success) {
        console.error('[PostGIS MVT Strategy] Tile generation failed:', result.error);
        return null;
      }
      
      return result.tileBuffer || null;
      
    } catch (error) {
      console.error('[PostGIS MVT Strategy] Error generating tile:', error);
      return null;
    }
  }
}

export class MVTStrategyPublisher extends BaseMVTPublisher {
  private db?: Database.Database;
  private strategies: Map<DataSourceType, MVTTileGenerationStrategy>;
  
  // Singleton instance
  private static instance: MVTStrategyPublisher | null = null;
  
  /**
   * Get or create singleton instance
   */
  static getInstance(workspaceBase: string, db?: Database.Database): MVTStrategyPublisher {
    if (!MVTStrategyPublisher.instance) {
      console.log('[MVT Strategy Publisher] Creating new singleton instance');
      MVTStrategyPublisher.instance = new MVTStrategyPublisher(workspaceBase, db);
    } else {
      console.log('[MVT Strategy Publisher] Reusing existing singleton instance');
    }
    return MVTStrategyPublisher.instance;
  }
  
  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    MVTStrategyPublisher.instance = null;
  }

  constructor(workspaceBase: string, db?: Database.Database) {
    super(workspaceBase, 'mvt');  // Call base class constructor
    this.db = db;
    
    // Register default strategies
    this.strategies = new Map();
    this.registerStrategy('geojson', new GeoJSONMVTTStrategy(this.mvtOutputDir));
    this.registerStrategy('shapefile', new ShapefileMVTTStrategy(this.mvtOutputDir));
    // Register PostGIS strategy with database connection support
    if (db) {
      this.registerStrategy('postgis', new PostGISMVTTStrategy(this.mvtOutputDir, db));
    }
  }
  
  /**
   * Register a custom tile generation strategy
   */
  registerStrategy(type: DataSourceType, strategy: MVTTileGenerationStrategy): void {
    this.strategies.set(type, strategy);
    console.log(`[MVT Publisher] Registered strategy for: ${type}`);
  }
  
  /**
   * Get strategy for a data source type
   */
  private getStrategy(type: DataSourceType): MVTTileGenerationStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(`No MVT generation strategy registered for data type: ${type}`);
    }
    return strategy;
  }

  /**
   * Publish/generate MVT tiles from NativeData reference
   * Automatically selects the appropriate strategy based on data source type
   * Implements BaseMVTPublisher.publish()
   */
  async publish(nativeData: NativeData, options: MVTTileOptions = {}): Promise<MVTPublishResult> {
    try {
      console.log('[MVT Strategy Publisher] Publishing tiles from NativeData (on-demand generation)...');
      console.log(`[MVT Strategy Publisher] Data source type: ${nativeData.type}`);
      console.log(`[MVT Strategy Publisher] Reference: ${nativeData.reference}`);
      
      const tilesetId = await this.generateTiles(nativeData, options);
      const metadata = this.getMetadata(tilesetId);
      
      return {
        success: true,
        tilesetId,
        serviceUrl: `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`,
        metadata: metadata || {}
      };
    } catch (error) {
      console.error('[MVT Strategy Publisher] Publication failed:', error);
      return {
        success: false,
        tilesetId: '',
        serviceUrl: '',
        metadata: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate MVT tiles from NativeData reference
   * Automatically selects the appropriate strategy based on data source type
   * All tiles are generated on-demand (no pre-generation)
   * 
   * @param nativeData - The native data to generate tiles from
   * @param options - Tile generation options
   * @returns tilesetId - Unique identifier for the generated tileset
   */
  async generateTiles(
    nativeData: NativeData,
    options: MVTTileOptions = {}
  ): Promise<string> {
    console.log('[MVT Strategy Publisher] Generating tiles from NativeData (on-demand)...');
    console.log(`[MVT Strategy Publisher] Data source type: ${nativeData.type}`);
    console.log(`[MVT Strategy Publisher] Reference: ${nativeData.reference}`);
    
    // Get the appropriate strategy for this data type
    const strategy = this.getStrategy(nativeData.type);
    
    // Delegate to the strategy
    return strategy.generateTiles(
      nativeData.reference,
      nativeData.type,
      nativeData,      
      options
    );
  }

  /**
   * Get tile from strategy (on-demand generation only)
   */
  async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
    console.log(`[MVT Strategy Publisher] getTile called: ${tilesetId}/${z}/${x}/${y}`);
    
    // Check metadata to get strategy type
    const metadataPath = path.join(this.mvtOutputDir, tilesetId, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      console.warn(`[MVT Strategy Publisher] Metadata not found: ${metadataPath}`);
      return null;
    }
    
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    console.log(`[MVT Strategy Publisher] Metadata loaded: strategy=${metadata.strategy}`);
    
    // Delegate to strategy for on-demand generation
    const strategy = this.strategies.get(metadata.strategy as DataSourceType);
    console.log(`[MVT Strategy Publisher] Strategy found: ${strategy ? 'yes' : 'no'}`);
    
    if (strategy && strategy.getTile) {
      console.log(`[MVT Strategy Publisher] Generating tile on-demand: ${tilesetId}/${z}/${x}/${y}`);
      return strategy.getTile(tilesetId, z, x, y);
    } else {
      console.warn(`[MVT Strategy Publisher] Strategy not found or getTile not implemented for: ${metadata.strategy}`);
    }
    
    console.warn(`[MVT Strategy Publisher] Tile generation failed`);
    return null;
  }

  /**
   * List all available tilesets
   */
  listTilesets(): Array<{ tilesetId: string; metadata: MVTPublishMetadata }> {
    if (!fs.existsSync(this.mvtOutputDir)) {
      return [];
    }

    const tilesets: Array<{ tilesetId: string; metadata: MVTPublishMetadata }> = [];
    const entries = fs.readdirSync(this.mvtOutputDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(this.mvtOutputDir, entry.name, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          tilesets.push({ tilesetId: entry.name, metadata });
        }
      }
    }

    return tilesets;
  }

  /**
   * Get tileset metadata
   */
  getMetadata(tilesetId: string): MVTPublishMetadata | null {
    const metadataPath = path.join(this.mvtOutputDir, tilesetId, 'metadata.json');
    
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      return metadata;
    }
    
    return null;
  }

  /**
   * Delete a tileset
   */
  deleteTileset(tilesetId: string): boolean {
    const tilesetDir = path.join(this.mvtOutputDir, tilesetId);
    
    if (fs.existsSync(tilesetDir)) {
      fs.rmSync(tilesetDir, { recursive: true, force: true });
      console.log(`[MVT Publisher] Deleted tileset: ${tilesetId}`);
      return true;
    }
    
    return false;
  }

  /**
   * Clean up expired tilesets (older than specified days)
   */
  cleanupExpiredTilesets(daysOld: number = 7): number {
    if (!fs.existsSync(this.mvtOutputDir)) {
      return 0;
    }

    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    const entries = fs.readdirSync(this.mvtOutputDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(this.mvtOutputDir, entry.name, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          const generatedAt = new Date(metadata.generatedAt).getTime();
          
          if (generatedAt < cutoffTime) {
            this.deleteTileset(entry.name);
            deletedCount++;
          }
        }
      }
    }

    console.log(`[MVT Publisher] Cleaned up ${deletedCount} expired tilesets`);
    return deletedCount;
  }
}
