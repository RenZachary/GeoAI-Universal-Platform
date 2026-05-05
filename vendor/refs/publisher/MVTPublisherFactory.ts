/**
 * MVT Publisher Factory
 * 
 * Creates appropriate MVT publisher based on datasource metadata.
 * Encapsulates publisher selection logic within the SDK.
 */

import { IMVTPublisher, MVTTileCallback } from './IMVTPublisher';
import { GeoJSONMVTPublisher } from './geojson/GeoJSONMVTPublisher';
import { PostGISMVTPublisher } from './postgis/PostGISMVTPublisher';
import type { FeatureCollection } from '../../types';

/**
 * Metadata for creating an MVT publisher
 */
export interface MVTPublisherMetadata {
  datasourceId: string;
  datasourceType: string;  // 'geojson', 'postgis', etc.
  dataProvider?: () => Promise<FeatureCollection>;  // For file-based datasources
  connectionConfig?: any;  // For database datasources (PostGIS)
  options?: {
    maxZoom?: number;
    tolerance?: number;
    extent?: number;
    buffer?: number;
  };
}

/**
 * Result of publishing a datasource to MVT
 */
export interface MVTPublishResult {
  success: boolean;
  layerId?: string;  // Unique identifier for the published layer
  tileUrl?: string;  // URL template: /api/mvt/tiles/{layerId}/{z}/{x}/{y}.pbf
  maxZoom?: number;
  error?: string;
}

/**
 * Factory for creating MVT publishers and managing publication
 */
export class MVTPublisherFactory {
  private static publishers = new Map<string, IMVTPublisher>();
  private static tileCallbacks = new Map<string, MVTTileCallback>();

  /**
   * Publish a datasource to MVT and return layer information
   * 
   * This is the main entry point - callers don't need to know which publisher is used.
   * The factory selects the appropriate publisher based on metadata.
   * 
   * @param metadata - Datasource metadata including type and data source
   * @returns Publish result with layerId and tile URL
   */
  static async publish(metadata: MVTPublisherMetadata): Promise<MVTPublishResult> {
    try {
      console.log(`🗺️ Publishing datasource ${metadata.datasourceId} (${metadata.datasourceType}) to MVT`);

      // Get or create appropriate publisher
      const publisher = this.getOrCreatePublisher(metadata.datasourceType);

      // Generate unique layer ID (publisher may add suffix/prefix)
      const layerId = this.generateLayerId(metadata.datasourceId, metadata.datasourceType);

      // Create tile callback using the publisher
      let tileCallback: MVTTileCallback;

      if (metadata.datasourceType === 'postgis') {
        // PostGIS needs connection config
        if (!metadata.connectionConfig) {
          return {
            success: false,
            error: 'PostGIS datasource requires connectionConfig'
          };
        }

        // For PostGIS, dataProvider should return the pool object
        const pool = metadata.connectionConfig.pool;
        if (!pool) {
          return {
            success: false,
            error: 'PostGIS connectionConfig must include a valid pool object'
          };
        }

        // Merge schema/table info into options
        const postgisOptions = {
          ...metadata.options,
          schemaName: metadata.connectionConfig.schemaName,
          tableName: metadata.connectionConfig.tableName,
          geometryColumn: metadata.connectionConfig.geometryColumn,
          srid: metadata.connectionConfig.srid,
          sql: metadata.connectionConfig.sql  // Pass the (possibly modified) SQL
        };

        tileCallback = await publisher.createTileService(
          layerId,
          async () => pool,  // Return the pool directly
          postgisOptions
        );
      } else {
        // File-based datasources need data provider
        if (!metadata.dataProvider) {
          return {
            success: false,
            error: 'File-based datasource requires dataProvider'
          };
        }

        tileCallback = await publisher.createTileService(
          layerId,
          metadata.dataProvider,
          metadata.options
        );
      }

      // Store the callback for later retrieval
      this.tileCallbacks.set(layerId, tileCallback);

      console.log(`✅ Published layer: ${layerId}`);

      return {
        success: true,
        layerId,
        tileUrl: `/api/mvt/tiles/${layerId}/{z}/{x}/{y}.pbf`,
        maxZoom: metadata.options?.maxZoom || 22
      };

    } catch (error: any) {
      console.error('❌ Failed to publish datasource:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get tile callback for a layer
   * 
   * @param layerId - Unique layer identifier
   * @returns Tile callback or undefined if not found
   */
  static getTileCallback(layerId: string): MVTTileCallback | undefined {
    return this.tileCallbacks.get(layerId);
  }

  /**
   * Unpublish a layer
   * 
   * @param layerId - Layer to unpublish
   * @returns true if layer was found and removed
   */
  static unpublish(layerId: string): boolean {
    const removed = this.tileCallbacks.delete(layerId);
    if (removed) {
      console.log(`🗑️ Unpublished layer: ${layerId}`);
    }
    return removed;
  }

  /**
   * List all published layers
   * 
   * @returns Array of layer IDs
   */
  static listPublishedLayers(): string[] {
    return Array.from(this.tileCallbacks.keys());
  }

  /**
   * Clear all published layers and caches
   */
  static clearAll(): void {
    this.tileCallbacks.clear();
    this.publishers.forEach((publisher) => {
      publisher.clearCache();
    });
    console.log('🧹 Cleared all MVT publications and caches');
  }

  /**
   * Get or create a publisher for the given datasource type
   */
  private static getOrCreatePublisher(datasourceType: string): IMVTPublisher {
    const normalizedType = datasourceType.toLowerCase();
    
    let publisher = this.publishers.get(normalizedType);
    if (!publisher) {
      publisher = this.createPublisher(normalizedType);
      this.publishers.set(normalizedType, publisher);
    }
    
    return publisher;
  }

  /**
   * Create a publisher instance based on datasource type
   */
  private static createPublisher(datasourceType: string): IMVTPublisher {
    switch (datasourceType) {
      case 'geojson':
      case 'local':
      case 'shapefile':
      case 'gpkg':
      case 'kml':
        return new GeoJSONMVTPublisher();
      
      case 'postgis':
        return new PostGISMVTPublisher();
      
      default:
        throw new Error(`Unsupported datasource type for MVT: ${datasourceType}`);
    }
  }

  /**
   * Generate unique layer ID from datasource ID and type
   * 
   * Publishers can override this if they need custom ID formats.
   */
  private static generateLayerId(datasourceId: string, datasourceType: string): string {
    // Simple format: {type}_{id}
    // Could be enhanced with hashing or other schemes
    return `${datasourceType}_${datasourceId}`;
  }

  /**
   * Check if a datasource type supports MVT publishing
   */
  static isSupported(datasourceType: string): boolean {
    try {
      this.createPublisher(datasourceType.toLowerCase());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of supported datasource types
   */
  static getSupportedTypes(): string[] {
    return ['geojson', 'postgis', 'local', 'shapefile', 'gpkg', 'kml'];
  }
}
