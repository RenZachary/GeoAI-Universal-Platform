/**
 * MVT Strategy Publisher - Generates Mapbox Vector Tiles using strategy pattern
 * Supports multiple data source types with optimized generation methods
 * 
 * Ideal for plugin workflows and integration with NativeData/DataAccessor
 */

import fs from 'fs';
import path from 'path';
import type { DataSourceType, NativeData } from '../../core/index';
import type Database from 'better-sqlite3';
import { BaseMVTPublisher, type MVTPublishResult } from './base/BaseMVTPublisher';
import { type MVTTileOptions, type MVTPublishMetadata } from './base/MVTPublisherTypes';
import type { MVTTileGenerationStrategy } from './base/MVTTStrategies/MVTTileGenerationStrategy';
import { GeoJSONMVTTStrategy } from './base/MVTTStrategies/GeoJSONMVTTStrategy';
import { ShapefileMVTTStrategy } from './base/MVTTStrategies/ShapefileMVTTStrategy';
import { PostGISMVTTStrategy } from './base/MVTTStrategies/PostGISMVTTStrategy';

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
    // Always register PostGIS strategy - connection info comes from NativeData metadata, not SQLite
    this.registerStrategy('postgis', new PostGISMVTTStrategy(this.mvtOutputDir, db!));
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
      console.log(`[MVT Strategy Publisher] Metadata keys:`, Object.keys(nativeData.metadata || {}));
      console.log(`[MVT Strategy Publisher] Has connection info:`, !!nativeData.metadata?.connection);

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
