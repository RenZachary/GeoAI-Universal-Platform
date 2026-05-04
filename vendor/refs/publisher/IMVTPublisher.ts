/**
 * MVT Publisher Interface
 * 
 * Abstract interface for Mapbox Vector Tile publishers.
 * Shields differences between GeoJSON and PostGIS implementations.
 */

import { MVTTileRequest, MVTTileCallback, MVTPublisherOptions } from './MVTPublisherTypes';

// Re-export types for backward compatibility
export { MVTTileRequest, MVTTileCallback, MVTPublisherOptions };

/**
 * Abstract MVT Publisher Interface
 * 
 * All MVT publishers must implement this interface.
 * This allows the server to work with any publisher without knowing implementation details.
 */
export interface IMVTPublisher {
  /**
   * Create a tile service callback for a datasource
   * 
   * @param datasourceId - Unique identifier for the datasource
   * @param dataProvider - Function that provides data (GeoJSON or connection info)
   * @param options - Configuration options
   * @returns Callback function that generates tiles on demand
   */
  createTileService(
    datasourceId: string,
    dataProvider: () => Promise<any>,
    options?: MVTPublisherOptions
  ): Promise<MVTTileCallback>;

  /**
   * Clear cached tile indices for a specific datasource
   * 
   * @param datasourceId - Datasource ID to clear
   */
  clearCache(datasourceId?: string): void;

  /**
   * Get cache statistics
   * 
   * @returns Statistics about cached datasources and tiles
   */
  getCacheStats(): {
    cachedDatasources: number;
    totalTilesGenerated?: number;
  };
}
