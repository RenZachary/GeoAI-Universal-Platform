/**
 * MVT Strategy Publisher - Generates Mapbox Vector Tiles using strategy pattern
 * Supports multiple data source types with optimized generation methods
 * 
 * Ideal for plugin workflows and integration with NativeData/DataAccessor
 * 
 * Architecture:
 * - Publisher: Handles persistence, caching, orchestration
 * - Strategy: Handles tile generation logic only
 */

import type { DataSourceType, NativeData } from '../core/index';
import type Database from 'better-sqlite3';
import { BaseMVTPublisher, type MVTPublishResult } from './base/BaseMVTPublisher';
import { type MVTTileOptions } from './base/MVTPublisherTypes';
import type { MVTTileGenerationStrategy } from './base/MVTTStrategies/MVTTileGenerationStrategy';
import { GeoJSONMVTTStrategy } from './base/MVTTStrategies/GeoJSONMVTTStrategy';
import { ShapefileMVTTStrategy } from './base/MVTTStrategies/ShapefileMVTTStrategy';
import { PostGISMVTTStrategy } from './base/MVTTStrategies/PostGISMVTTStrategy';

export class MVTStrategyPublisher extends BaseMVTPublisher {
  private db?: Database.Database;
  private strategies: Map<DataSourceType, MVTTileGenerationStrategy>;
  
  // Cache strategy configurations (tilesetId -> config)
  private strategyConfigs: Map<string, any> = new Map();

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
    super(workspaceBase, 'mvt');
    this.db = db;

    // Register default strategies (no longer need mvtOutputDir)
    this.strategies = new Map();
    this.registerStrategy('geojson', new GeoJSONMVTTStrategy());
    this.registerStrategy('shapefile', new ShapefileMVTTStrategy(this.getTilesetDir('temp')));
    this.registerStrategy('postgis', new PostGISMVTTStrategy(db!));
  }

  /**
   * Register a custom tile generation strategy
   */
  registerStrategy(type: DataSourceType, strategy: MVTTileGenerationStrategy): void {
    this.strategies.set(type, strategy);
    console.log(`[MVT Strategy Publisher] Registered strategy for: ${type}`);
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
   */
  async publish(nativeData: NativeData, options: MVTTileOptions = {}): Promise<MVTPublishResult> {
    try {
      console.log('[MVT Strategy Publisher] Publishing tiles from NativeData...');
      console.log(`[MVT Strategy Publisher] Data source type: ${nativeData.type}`);
      console.log(`[MVT Strategy Publisher] Reference: ${nativeData.reference}`);

      // Generate tilesetId using base class method
      const tilesetId = options.tilesetId || this.generateTilesetId('mvt');

      // Get the appropriate strategy
      const strategy = this.getStrategy(nativeData.type);

      // Delegate to strategy for tile generation (returns config, not tilesetId)
      const config = await strategy.generateTiles(
        nativeData.reference,
        nativeData.type,
        nativeData,
        options
      );

      // Build metadata from strategy result + base info
      const metadata = {
        id: tilesetId,
        generatedAt: new Date().toISOString(),
        format: 'pbf',
        ...config.metadata
      };

      // Save metadata using base class method
      this.saveMetadata(tilesetId, metadata);

      // Cache the strategy configuration for on-demand tile generation
      this.strategyConfigs.set(tilesetId, config);

      console.log(`[MVT Strategy Publisher] Published successfully: ${tilesetId}`);

      return {
        success: true,
        tilesetId,
        serviceUrl: `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`,
        metadata
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
   * Get tile from strategy (on-demand generation only)
   */
  async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
    console.log(`[MVT Strategy Publisher] getTile called: ${tilesetId}/${z}/${x}/${y}`);

    // Try to get config from memory cache first
    let config = this.strategyConfigs.get(tilesetId);

    // If not in cache, reload from metadata file
    if (!config) {
      console.log(`[MVT Strategy Publisher] Config not in cache, reloading from disk...`);
      
      const metadata = this.loadMetadata(tilesetId);
      if (!metadata) {
        console.warn(`[MVT Strategy Publisher] Metadata not found for: ${tilesetId}`);
        return null;
      }

      // Reload strategy configuration
      const strategy = this.getStrategy(metadata.strategy as DataSourceType);
      if (!strategy || !strategy.generateTiles) {
        console.warn(`[MVT Strategy Publisher] Strategy not found or doesn't support reload: ${metadata.strategy}`);
        return null;
      }

      // Create minimal NativeData for reload
      const nativeData: NativeData = {
        id: tilesetId,
        type: metadata.strategy as DataSourceType,
        reference: metadata.sourceFile || metadata.sourceReference || '',
        createdAt: new Date(),
        metadata: {
          connection: metadata.connectionInfo,
          geometryColumn: metadata.geometryColumn,
          styleConfig: metadata.styleConfig,
          geometryType: metadata.geometryType
        } as any  // Type assertion to avoid complex type issues during reload
      };

      try {
        config = await strategy.generateTiles(
          nativeData.reference,
          nativeData.type,
          nativeData,
          {
            minZoom: metadata.minZoom,
            maxZoom: metadata.maxZoom,
            extent: metadata.extent
          }
        );
        
        // Cache the reloaded config
        this.strategyConfigs.set(tilesetId, config);
        console.log(`[MVT Strategy Publisher] Config reloaded and cached for: ${tilesetId}`);
      } catch (error) {
        console.error('[MVT Strategy Publisher] Failed to reload config:', error);
        return null;
      }
    }

    // Get strategy for tile generation
    const metadata = this.loadMetadata(tilesetId);
    if (!metadata) {
      console.warn(`[MVT Strategy Publisher] Metadata not found: ${tilesetId}`);
      return null;
    }

    const strategy = this.strategies.get(metadata.strategy as DataSourceType);
    if (!strategy || !strategy.getTile) {
      console.warn(`[MVT Strategy Publisher] Strategy not found or getTile not implemented: ${metadata.strategy}`);
      return null;
    }

    // Generate tile using strategy
    console.log(`[MVT Strategy Publisher] Generating tile on-demand: ${tilesetId}/${z}/${x}/${y}`);
    return strategy.getTile(config, z, x, y);
  }

  /**
   * Clean up expired tilesets (older than specified days)
   */
  cleanupExpiredTilesets(daysOld: number = 7): number {
    const tilesets = this.listTilesetsFromDisk();
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const { tilesetId, metadata } of tilesets) {
      if (metadata.generatedAt) {
        const generatedAt = new Date(metadata.generatedAt).getTime();
        if (generatedAt < cutoffTime) {
          this.deleteTileset(tilesetId);
          deletedCount++;
        }
      }
    }

    console.log(`[MVT Strategy Publisher] Cleaned up ${deletedCount} expired tilesets`);
    return deletedCount;
  }
}
