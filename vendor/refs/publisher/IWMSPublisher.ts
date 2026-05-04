/**
 * WMS Publisher Interface
 * 
 * Abstract interface for Web Map Service (WMS) publishers.
 * Shields differences between different raster data source implementations.
 */

/**
 * Represents a WMS GetMap request
 */
export interface WMSRequest {
  layerId: string;
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY]
  width: number;
  height: number;
  crs?: string; // e.g., 'EPSG:4326'
  format?: 'image/png' | 'image/jpeg';
}

/**
 * Callback function that generates WMS images on demand
 */
export type WMSMapCallback = (
  request: WMSRequest
) => Promise<Buffer | null>;

/**
 * Configuration options for WMS publishing
 */
export interface WMSPublisherOptions {
  /** Output image format (default: 'image/png') */
  format?: 'image/png' | 'image/jpeg';
  /** Image quality for JPEG (0-100, default: 80) */
  quality?: number;
  /** Enable caching of rendered tiles (default: true) */
  enableCache?: boolean;
  /** Cache TTL in seconds (default: 3600) */
  cacheTTL?: number;
}

/**
 * Abstract WMS Publisher Interface
 * 
 * All WMS publishers must implement this interface.
 * This allows the server to work with any publisher without knowing implementation details.
 */
export interface IWMSPublisher {
  /**
   * Create a WMS service callback for a datasource
   * 
   * @param datasourceId - Unique identifier for the datasource
   * @param dataProvider - Function that provides data (e.g., file path or connection info)
   * @param options - Configuration options
   * @returns Callback function that generates WMS images on demand
   */
  createWMSService(
    datasourceId: string,
    dataProvider: () => Promise<any>,
    options?: WMSPublisherOptions
  ): Promise<WMSMapCallback>;

  /**
   * Clear cached rendered images for a specific datasource
   * 
   * @param datasourceId - Datasource ID to clear
   */
  clearCache(datasourceId?: string): void;

  /**
   * Get cache statistics
   * 
   * @returns Statistics about cached datasources and rendered images
   */
  getCacheStats(): {
    cachedDatasources: number;
    totalImagesGenerated?: number;
  };
}
