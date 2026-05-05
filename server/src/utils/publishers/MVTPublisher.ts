/**
 * MVT Publisher - Generates Mapbox Vector Tiles using strategy pattern
 * Supports multiple data source types with optimized generation methods
 */

import geojsonvt from 'geojson-vt';
import vtPbf from 'vt-pbf';
import fs from 'fs';
import path from 'path';
import type { DataSourceType, NativeData } from '../../core/index';
import { DataAccessorFactory } from '../../data-access/factories/DataAccessorFactory';
import type Database from 'better-sqlite3';


export interface MVTTileOptions {
  minZoom?: number;
  maxZoom?: number;
  extent?: number;
  tolerance?: number;
  buffer?: number;
  layerName?: string;  // For PostGIS: table name or layer name
  generationMode?: 'pre-generate' | 'on-demand';  // Tile generation strategy
}

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
 * Supports both pre-generation and on-demand modes
 */
class GeoJSONMVTTStrategy implements MVTTileGenerationStrategy {
  // Cache for tile indexes (tilesetId -> tileIndex)
  private tileIndexCache: Map<string, any> = new Map();
  
  constructor(private mvtOutputDir: string) {}

  async generateTiles(
    sourceReference: string,
    dataSourceType: DataSourceType,
    options: MVTTileOptions
  ): Promise<string> {
    const {
      minZoom = 0,
      maxZoom = 22,
      extent = 4096,
      tolerance = 3,
      buffer = 64,
      generationMode = 'on-demand'  // Default to on-demand for better performance
    } = options;

    console.log(`[GeoJSON MVT Strategy] Mode: ${generationMode}`);
    
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
    
    if (generationMode === 'pre-generate') {
      // Pre-generate all tiles (only for small datasets)
      console.log('[GeoJSON MVT Strategy] Pre-generating all tiles...');
      await this.preGenerateAllTiles(tileIndex, tilesetDir, {
        minZoom,
        maxZoom,
        extent,
        tolerance,
        buffer
      });
    } else {
      // On-demand mode: only save metadata, tiles generated when requested
      console.log('[GeoJSON MVT Strategy] On-demand mode enabled. Tiles will be generated when requested.');
    }

    // Create tileset metadata
    const metadata = {
      id: tilesetId,
      minZoom,
      maxZoom,
      extent,
      generationMode,
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
    console.log(`[GeoJSON MVT Strategy] Cache keys: ${Array.from(this.tileIndexCache.keys()).join(', ')}`);
    
    const cached = this.tileIndexCache.get(tilesetId);
    
    if (!cached) {
      console.warn(`[GeoJSON MVT Strategy] Tileset not found in cache: ${tilesetId}`);
      return null;
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
  
  /**
   * Pre-generate all tiles (for small datasets)
   */
  private async preGenerateAllTiles(
    tileIndex: any,
    tilesetDir: string,
    options: MVTTileOptions
  ): Promise<void> {
    const { minZoom = 0, maxZoom = 22, extent = 4096 } = options;
    let tileCount = 0;
    
    for (let z = minZoom; z <= maxZoom; z++) {
      const tileCoords = this.getTileCoordsAtZoom(z, tileIndex);
      
      for (const [x, y] of tileCoords) {
        const tile = tileIndex.getTile(z, x, y);
        
        if (tile) {
          const layers: any = {};
          layers['default'] = {
            features: tile.features || [],
            extent: extent,
            version: 2
          };
          
          const pbf = vtPbf.fromGeojsonVt(layers, { version: 2, extent });
          
          const tilePath = path.join(tilesetDir, `${z}`, `${x}`);
          if (!fs.existsSync(tilePath)) {
            fs.mkdirSync(tilePath, { recursive: true });
          }
          
          const tileFile = path.join(tilePath, `${y}.pbf`);
          fs.writeFileSync(tileFile, Buffer.from(pbf));
          
          tileCount++;
        }
      }
    }
    
    console.log(`[GeoJSON MVT Strategy] Pre-generated ${tileCount} tiles`);
  }
  
  private getTileCoordsAtZoom(zoom: number, tileIndex: any): Array<[number, number]> {
    const coords: Array<[number, number]> = [];
    const tileSize = Math.pow(2, zoom);
    
    for (let x = 0; x < tileSize; x++) {
      for (let y = 0; y < tileSize; y++) {
        const tile = tileIndex.getTile(zoom, x, y);
        if (tile && tile.features && tile.features.length > 0) {
          coords.push([x, y]);
        }
      }
    }
    
    return coords;
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
    options: MVTTileOptions
  ): Promise<string> {
    console.log('[Shapefile MVT Strategy] Converting Shapefile to GeoJSON...');
    
    // Use DataAccessor to read Shapefile and convert to GeoJSON
    const factory = new DataAccessorFactory();
    const accessor = factory.createAccessor('shapefile');
    
    // Read the shapefile using the accessor's loadGeoJSON method
    // ShapefileAccessor extends GeoJSONBasedAccessor which has loadGeoJSON
    const geojson = await (accessor as any).loadGeoJSON(sourceReference);
    
    console.log(`[Shapefile MVT Strategy] Converted to GeoJSON with ${geojson.features?.length || 0} features`);
    
    // Now delegate to GeoJSON strategy
    const geojsonStrategy = new GeoJSONMVTTStrategy(this.mvtOutputDir);
    
    // Create a temporary NativeData-like object for the GeoJSON strategy
    const tempNativeData = {
      id: `temp_${Date.now()}`,
      type: 'geojson' as DataSourceType,
      reference: '', // Not needed since we're passing geojson directly
      metadata: {},
      createdAt: new Date()
    };
    
    // Save the converted GeoJSON to a temporary file
    const tempGeoJsonPath = path.join(
      this.mvtOutputDir,
      `temp_${Date.now()}.geojson`
    );
    fs.writeFileSync(tempGeoJsonPath, JSON.stringify(geojson), 'utf-8');
    
    try {
      // Generate tiles from the temporary GeoJSON file
      return await geojsonStrategy.generateTiles(tempGeoJsonPath, 'geojson', options);
    } finally {
      // Clean up temporary file
      if (fs.existsSync(tempGeoJsonPath)) {
        fs.unlinkSync(tempGeoJsonPath);
        console.log('[Shapefile MVT Strategy] Cleaned up temporary GeoJSON file');
      }
    }
  }
}

/**
 * PostGIS MVT Strategy - Uses ST_AsMVT() SQL function (most efficient)
 * Generates tiles on-demand using PostGIS native MVT support
 */
class PostGISMVTTStrategy implements MVTTileGenerationStrategy {
  private tileIndexCache: Map<string, any> = new Map();
  
  constructor(
    private mvtOutputDir: string,
    private db?: Database.Database
  ) {}

  async generateTiles(
    sourceReference: string,
    dataSourceType: DataSourceType,
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
      layerName = 'default',
      generationMode = 'on-demand'  // PostGIS always uses on-demand
    } = options;
    
    // Generate a unique ID for this tileset
    const tilesetId = `mvt_postgis_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tilesetDir = path.join(this.mvtOutputDir, tilesetId);

    if (!fs.existsSync(tilesetDir)) {
      fs.mkdirSync(tilesetDir, { recursive: true });
    }
    
    // Parse sourceReference to extract connection info and table/query
    // Format: "postgis://user:pass@host:port/database?table=tablename&geom=geom"
    // Or: "postgis://user:pass@host:port/database?query=SELECT..."
    
    const connectionInfo = this.parsePostGISReference(sourceReference);
    
    if (!connectionInfo) {
      throw new Error('Invalid PostGIS connection reference format');
    }
    
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
      generationMode: 'on-demand',  // PostGIS always on-demand
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
    
    try {
      // Note: In production, you would use the pg library to connect to PostGIS
      // This is a placeholder implementation showing the SQL approach
      
      // Calculate tile bounds in Web Mercator (EPSG:3857)
      const tileBounds = this.calculateTileBounds(z, x, y);
      
      // Build the ST_AsMVT query
      // This query generates MVT tiles directly from PostGIS
      let sql: string;
      
      if (connectionInfo.tableName) {
        // Table-based query
        sql = `
          SELECT ST_AsMVT(q, ${extent}, '${layerName}') as mvt
          FROM (
            SELECT ST_AsMVTGeom(
              ${connectionInfo.geometryColumn || 'geom'},
              ST_TileEnvelope(${z}, ${x}, ${y}),
              ${extent},
              ${options.buffer || 64},
              true
            ) AS geom,
            * EXCLUDE (${connectionInfo.geometryColumn || 'geom'})
            FROM ${connectionInfo.schema || 'public'}.${connectionInfo.tableName}
            WHERE ${connectionInfo.geometryColumn || 'geom'} && ST_TileEnvelope(${z}, ${x}, ${y})
          ) q
        `;
      } else if (connectionInfo.sqlQuery) {
        // Custom SQL query
        sql = `
          SELECT ST_AsMVT(q, ${extent}, '${layerName}') as mvt
          FROM (
            SELECT ST_AsMVTGeom(
              ${connectionInfo.geometryColumn || 'geom'},
              ST_TileEnvelope(${z}, ${x}, ${y}),
              ${extent},
              ${options.buffer || 64},
              true
            ) AS geom,
            * EXCLUDE (${connectionInfo.geometryColumn || 'geom'})
            FROM (${connectionInfo.sqlQuery}) AS subquery
            WHERE ${connectionInfo.geometryColumn || 'geom'} && ST_TileEnvelope(${z}, ${x}, ${y})
          ) q
        `;
      } else {
        throw new Error('PostGIS source must specify either tableName or sqlQuery');
      }
      
      console.log(`[PostGIS MVT Strategy] Executing MVT query for tile ${z}/${x}/${y}`);
      
      // TODO: Execute the SQL query using pg library
      // For now, return null as placeholder
      // In production:
      // const pool = new Pool(connectionInfo);
      // const result = await pool.query(sql);
      // return result.rows[0]?.mvt || null;
      
      console.warn('[PostGIS MVT Strategy] PostGIS MVT execution not fully implemented (requires pg library integration)');
      return null;
      
    } catch (error) {
      console.error('[PostGIS MVT Strategy] Error generating tile:', error);
      return null;
    }
  }
  
  /**
   * Parse PostGIS reference string to extract connection info
   */
  private parsePostGISReference(reference: string): PostGISConnectionInfo | null {
    try {
      // Expected format: postgis://user:pass@host:port/database?table=tablename&geom=geom
      const url = new URL(reference);
      
      if (url.protocol !== 'postgis:') {
        return null;
      }
      
      const params = new URLSearchParams(url.search);
      
      return {
        user: url.username,
        password: url.password,
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.substring(1), // Remove leading /
        schema: params.get('schema') || 'public',
        tableName: params.get('table') || undefined,
        sqlQuery: params.get('query') ? decodeURIComponent(params.get('query')!) : undefined,
        geometryColumn: params.get('geom') || 'geom'
      };
    } catch (error) {
      console.error('[PostGIS MVT Strategy] Failed to parse reference:', error);
      return null;
    }
  }
  
  /**
   * Calculate tile bounds in Web Mercator coordinates
   */
  private calculateTileBounds(z: number, x: number, y: number): { minX: number; minY: number; maxX: number; maxY: number } {
    const tileSize = 20037508.34; // Half of Earth's circumference in meters
    const numTiles = Math.pow(2, z);
    const tileWidth = (2 * tileSize) / numTiles;
    
    const minX = -tileSize + x * tileWidth;
    const maxX = -tileSize + (x + 1) * tileWidth;
    const maxY = tileSize - y * tileWidth;
    const minY = tileSize - (y + 1) * tileWidth;
    
    return { minX, minY, maxX, maxY };
  }
}

interface PostGISConnectionInfo {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  schema?: string;
  tableName?: string;
  sqlQuery?: string;
  geometryColumn?: string;
}

export class MVTPublisher {
  private workspaceBase: string;
  private mvtOutputDir: string;
  private db?: Database.Database;
  private strategies: Map<DataSourceType, MVTTileGenerationStrategy>;
  
  // Singleton instance
  private static instance: MVTPublisher | null = null;
  
  /**
   * Get or create singleton instance
   */
  static getInstance(workspaceBase: string, db?: Database.Database): MVTPublisher {
    if (!MVTPublisher.instance) {
      console.log('[MVT Publisher] Creating new singleton instance');
      MVTPublisher.instance = new MVTPublisher(workspaceBase, db);
    } else {
      console.log('[MVT Publisher] Reusing existing singleton instance');
    }
    return MVTPublisher.instance;
  }
  
  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    MVTPublisher.instance = null;
  }

  constructor(workspaceBase: string, db?: Database.Database) {
    this.workspaceBase = workspaceBase;
    this.mvtOutputDir = path.join(workspaceBase, 'results', 'mvt');
    this.db = db;
    
    // Ensure output directory exists
    if (!fs.existsSync(this.mvtOutputDir)) {
      fs.mkdirSync(this.mvtOutputDir, { recursive: true });
    }
    
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
   * Generate MVT tiles from NativeData reference
   * Automatically selects the appropriate strategy based on data source type
   */
  async generateTiles(
    nativeData: NativeData,
    options: MVTTileOptions = {}
  ): Promise<string> {
    console.log('[MVT Publisher] Generating tiles from NativeData...');
    console.log(`[MVT Publisher] Data source type: ${nativeData.type}`);
    console.log(`[MVT Publisher] Reference: ${nativeData.reference}`);
    
    // Get the appropriate strategy for this data type
    const strategy = this.getStrategy(nativeData.type);
    
    // Delegate to the strategy
    return strategy.generateTiles(
      nativeData.reference,
      nativeData.type,
      options
    );
  }

  /**
   * Get tile from filesystem or generate on-demand
   */
  async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
    console.log(`[MVT Publisher] getTile called: ${tilesetId}/${z}/${x}/${y}`);
    
    // First, try to get from filesystem (pre-generated tiles)
    const tilePath = path.join(this.mvtOutputDir, tilesetId, `${z}`, `${x}`, `${y}.pbf`);
    
    if (fs.existsSync(tilePath)) {
      console.log(`[MVT Publisher] Found pre-generated tile: ${tilePath}`);
      return fs.readFileSync(tilePath);
    }
    
    // If not found, check metadata for generation mode
    const metadataPath = path.join(this.mvtOutputDir, tilesetId, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      console.warn(`[MVT Publisher] Metadata not found: ${metadataPath}`);
      return null;
    }
    
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    console.log(`[MVT Publisher] Metadata loaded: generationMode=${metadata.generationMode}, strategy=${metadata.strategy}`);
    
    // If on-demand mode, delegate to strategy
    if (metadata.generationMode === 'on-demand') {
      const strategy = this.strategies.get(metadata.strategy as DataSourceType);
      console.log(`[MVT Publisher] Strategy found: ${strategy ? 'yes' : 'no'}`);
      
      if (strategy && strategy.getTile) {
        console.log(`[MVT Publisher] Generating tile on-demand: ${tilesetId}/${z}/${x}/${y}`);
        return strategy.getTile(tilesetId, z, x, y);
      } else {
        console.warn(`[MVT Publisher] Strategy not found or getTile not implemented for: ${metadata.strategy}`);
      }
    }
    
    console.warn(`[MVT Publisher] Tile not found and cannot generate on-demand`);
    return null;
  }

  /**
   * List all available tilesets
   */
  listTilesets(): Array<{ id: string; metadata: any }> {
    if (!fs.existsSync(this.mvtOutputDir)) {
      return [];
    }

    const tilesets: Array<{ id: string; metadata: any }> = [];
    const entries = fs.readdirSync(this.mvtOutputDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(this.mvtOutputDir, entry.name, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          tilesets.push({ id: entry.name, metadata });
        }
      }
    }

    return tilesets;
  }

  /**
   * Get tileset metadata
   */
  getMetadata(tilesetId: string): any | null {
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
