/**
 * GeoJSON MVT Publisher Service
 * 
 * Converts GeoJSON data sources to Mapbox Vector Tiles (MVT) on-the-fly.
 * Uses @2gis/geojson-vt for tile indexing and vt-pbf for PBF encoding.
 * 
 * Architecture: Singleton tile index per datasource with TTL-based caching.
 */

import type { FeatureCollection } from '../../../types';
import { MVTTileRequest, MVTTileCallback, MVTPublisherOptions } from '../MVTPublisherTypes';
import * as geojsonvtModule from 'geojson-vt';
// Handle double default export in ES Module environment
const geojsonvt = (geojsonvtModule as any).default?.default || (geojsonvtModule as any).default || geojsonvtModule;
import vtPbf from 'vt-pbf';

/**
 * Internal cache entry for tile indices
 */
interface TileIndexCache {
  index: any; // geojson-vt tile index instance
  createdAt: number;
  featureCount: number;
}

/**
 * MVT Publisher - Converts GeoJSON to vector tiles
 * 
 * Implements singleton pattern for tile index caching to optimize performance.
 * Each datasource gets its own cached tile index that is reused across requests.
 */
export class GeoJSONMVTPublisher {
  private static tileIndexCache = new Map<string, TileIndexCache>();
  private static readonly CACHE_TTL = 3600000; // 1 hour in milliseconds

  constructor() {}

  /**
   * Create an MVT tile service callback for a GeoJSON datasource
   * 
   * @param datasourceId - Unique identifier for the datasource
   * @param getGeoJSON - Async function that returns the GeoJSON FeatureCollection
   * @param options - Tile generation configuration options
   * @returns A callback function that generates tiles on demand
   * 
   * @example
   * ```typescript
   * const publisher = new GeoJSONMVTPublisher();
   * const tileCallback = await publisher.createTileService(
   *   'my-datasource',
   *   async () => await datasource.query({}),
   *   { maxZoom: 22, tolerance: 3 }
   * );
   * 
   * // Use the callback in an Express route
   * app.get('/tiles/:id/:z/:x/:y.pbf', async (req, res) => {
   *   const tile = await tileCallback({
   *     datasourceId: req.params.id,
   *     z: parseInt(req.params.z),
   *     x: parseInt(req.params.x),
   *     y: parseInt(req.params.y)
   *   });
   *   res.send(tile);
   * });
   * ```
   */
  async createTileService(
    datasourceId: string,
    getGeoJSON: () => Promise<FeatureCollection>,
    options: MVTPublisherOptions = {}
  ): Promise<MVTTileCallback> {
    const {
      maxZoom = 22,
      tolerance = 3,
      extent = 4096,
      buffer = 64,
      indexId = datasourceId
    } = options;

    // Ensure tile index exists in cache
    await this.ensureTileIndex(datasourceId, getGeoJSON, {
      maxZoom,
      tolerance,
      extent,
      buffer,
      indexId
    });

    // Return the tile generation callback
    return async (request: MVTTileRequest): Promise<Buffer | null> => {
      try {
        const cached = GeoJSONMVTPublisher.tileIndexCache.get(request.datasourceId);
        
        if (!cached) {
          console.warn(`⚠️ Tile index not found for ${request.datasourceId}, regenerating...`);
          await this.ensureTileIndex(request.datasourceId, getGeoJSON, options);
          return this.generateTile(request, options);
        }

        // Get tile data from index
        const tileData = cached.index.getTile(request.z, request.x, request.y);
        
        if (!tileData) {
          return null;
        }

        // Encode to PBF format
        const layerName = this.getLayerName(request.datasourceId);
        
        const pbf = vtPbf.fromGeojsonVt({ [layerName]: tileData }, {
          version: 2,
          extent: 4096
        });
        
        return Buffer.from(pbf);
      } catch (error) {
        console.error(
          `❌ Error generating tile z=${request.z}, x=${request.x}, y=${request.y}:`,
          error
        );
        return null;
      }
    };
  }

  /**
   * Ensure tile index exists in cache, create if needed or expired
   */
  private async ensureTileIndex(
    datasourceId: string,
    getGeoJSON: () => Promise<FeatureCollection>,
    options: MVTPublisherOptions
  ): Promise<void> {
    const now = Date.now();
    const cached = GeoJSONMVTPublisher.tileIndexCache.get(datasourceId);

    // Check if cache is valid (exists and not expired)
    if (cached && (now - cached.createdAt < GeoJSONMVTPublisher.CACHE_TTL)) {
      return; // Cache hit, nothing to do
    }

    console.log(`🔄 Building tile index for ${datasourceId}...`);
    
    // Fetch GeoJSON data
    const geojson = await getGeoJSON();
    
    console.log('🔍 [GeoJSONMVTPublisher] GeoJSON received:', {
      type: geojson?.type,
      featureCount: geojson?.features?.length,
      hasFeatures: !!geojson?.features,
      sampleFeature: geojson?.features?.[0] ? {
        type: geojson.features[0].type,
        geometryType: geojson.features[0].geometry?.type,
        propertiesKeys: Object.keys(geojson.features[0].properties || {})
      } : null
    });
    
    // Log geometry complexity
    let totalCoords = 0;
    let sampleFeature: any = null;
    geojson.features.forEach((f: any, idx: number) => {
      if (f.geometry && f.geometry.coordinates) {
        const coords = JSON.stringify(f.geometry.coordinates);
        totalCoords += coords.length;
        if (idx === 0) sampleFeature = f;
      }
    });
    console.log(`📊 Geometry complexity: ${geojson.features.length} features, ~${totalCoords} coord chars`);
    if (sampleFeature) {
      console.log(`🔍 Sample feature geometry type: ${sampleFeature.geometry.type}`);
      console.log(`🔍 Sample feature has ${JSON.stringify(sampleFeature.geometry.coordinates).length} coord chars`);
    }
    
    // Preprocess for optimal tile generation
    const processedGeoJSON = this.preprocessGeoJSON(geojson);

    // Create tile index using geojson-vt
    console.log(`🔧 Building tile index with options:`, {
      maxZoom: options.maxZoom,
      tolerance: options.tolerance,
      extent: options.extent,
      buffer: options.buffer,
      featureCount: processedGeoJSON.features.length
    });
    
    const index = geojsonvt(processedGeoJSON, {
      maxZoom: options.maxZoom || 22,
      tolerance: options.tolerance || 3,
      extent: options.extent || 4096,
      buffer: options.buffer || 64,
      promoteId: 'id' // Use feature.id for consistent feature identification
    });

    // Store in cache
    GeoJSONMVTPublisher.tileIndexCache.set(datasourceId, {
      index,
      createdAt: now,
      featureCount: geojson.features.length
    });

    console.log(
      `✅ Tile index built for ${datasourceId} (${geojson.features.length} features)`
    );
  }

  /**
   * Preprocess GeoJSON for optimal tile generation
   * 
   * Converts all property values to strings as required by geojson-vt + vt-pbf.
   * This ensures correct PBF encoding of tile attributes.
   */
  private preprocessGeoJSON(geojson: FeatureCollection): FeatureCollection {
    const processedFeatures = geojson.features.map(feature => {
      if (!feature.properties) {
        return feature;
      }

      const processedProperties: Record<string, any> = {};
      
      for (const [key, value] of Object.entries(feature.properties)) {
        // Skip null/undefined values
        if (value === null || value === undefined) {
          continue;
        }
        
        // Convert to string for PBF encoding compatibility
        if (typeof value === 'number') {
          processedProperties[key] = String(value);
        } else if (typeof value === 'boolean') {
          processedProperties[key] = value ? 'true' : 'false';
        } else {
          processedProperties[key] = String(value);
        }
      }

      return {
        ...feature,
        properties: processedProperties
      };
    });

    return {
      type: 'FeatureCollection',
      features: processedFeatures,
      metadata: geojson.metadata
    };
  }

  /**
   * Generate a single tile (used when cache miss occurs)
   */
  private async generateTile(
    request: MVTTileRequest,
    options: MVTPublisherOptions
  ): Promise<Buffer | null> {
    const cached = GeoJSONMVTPublisher.tileIndexCache.get(request.datasourceId);
    
    if (!cached) {
      return null;
    }

    const tileData = cached.index.getTile(request.z, request.x, request.y);
    
    if (!tileData) {
      return null;
    }

    const layerName = this.getLayerName(request.datasourceId);
    const pbf = vtPbf.fromGeojsonVt({ [layerName]: tileData });
    
    return Buffer.from(pbf);
  }

  /**
   * Get layer name from datasource ID
   * 
   * Removes file extensions to comply with MVT source-layer naming conventions.
   * Example: "rivers.geojson" → "rivers"
   */
  private getLayerName(datasourceId: string): string {
    return datasourceId.replace(/\.[^/.]+$/, '');
  }

  /**
   * Clear tile index cache
   * 
   * @param datasourceId - Optional specific datasource to clear. If omitted, clears all caches.
   */
  static clearCache(datasourceId?: string): void {
    if (datasourceId) {
      GeoJSONMVTPublisher.tileIndexCache.delete(datasourceId);
      console.log(`🗑️ Cleared tile index cache for ${datasourceId}`);
    } else {
      GeoJSONMVTPublisher.tileIndexCache.clear();
      console.log('🗑️ Cleared all tile index caches');
    }
  }

  /**
   * Get cache statistics for monitoring
   * 
   * @returns Object containing cache size and list of cached datasources
   */
  static getCacheStats(): { size: number; datasources: string[] } {
    return {
      size: GeoJSONMVTPublisher.tileIndexCache.size,
      datasources: Array.from(GeoJSONMVTPublisher.tileIndexCache.keys())
    };
  }

  // Instance method wrappers for IMVTPublisher interface
  
  /**
   * Clear cached tile indices (instance method)
   */
  clearCache(datasourceId?: string): void {
    GeoJSONMVTPublisher.clearCache(datasourceId);
  }

  /**
   * Get cache statistics (instance method)
   */
  getCacheStats(): { cachedDatasources: number; totalTilesGenerated?: number } {
    const stats = GeoJSONMVTPublisher.getCacheStats();
    return {
      cachedDatasources: stats.size,
      totalTilesGenerated: undefined  // Not tracked yet
    };
  }
}
