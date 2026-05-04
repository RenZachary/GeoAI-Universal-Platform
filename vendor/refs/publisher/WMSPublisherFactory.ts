/**
 * WMS Publisher Factory
 * 
 * Creates appropriate WMS publisher based on datasource metadata.
 * Encapsulates publisher selection logic within the SDK.
 */

import { IWMSPublisher, WMSMapCallback, WMSPublisherOptions } from './IWMSPublisher';
import { GDALTIFFWMSPublisher } from './GDALTIFFWMSPublisher';

/**
 * Metadata for creating a WMS publisher
 */
export interface WMSPublisherMetadata {
  datasourceId: string;
  datasourceType: string;  // 'tiff', etc.
  dataProvider?: () => Promise<any>;  // For file-based datasources
  options?: WMSPublisherOptions;
}

/**
 * Result of publishing a datasource to WMS
 */
export interface WMSPublishResult {
  success: boolean;
  layerId?: string;  // Unique identifier for the published layer
  wmsUrl?: string;   // WMS endpoint URL template
  error?: string;
}

/**
 * Factory for creating WMS publishers and managing publication
 */
export class WMSPublisherFactory {
  private static publishers = new Map<string, IWMSPublisher>();
  private static wmsCallbacks = new Map<string, WMSMapCallback>();

  /**
   * Publish a datasource to WMS and return layer information
   * 
   * This is the main entry point - callers don't need to know which publisher is used.
   * The factory selects the appropriate publisher based on metadata.
   * 
   * @param metadata - Datasource metadata including type and data source
   * @returns Publish result with layerId and WMS URL
   */
  static async publish(metadata: WMSPublisherMetadata): Promise<WMSPublishResult> {
    try {
      console.log(`🛰️ Publishing datasource ${metadata.datasourceId} (${metadata.datasourceType}) to WMS`);

      // Get or create appropriate publisher
      const publisher = this.getOrCreatePublisher(metadata.datasourceType);

      // Generate unique layer ID
      const layerId = this.generateLayerId(metadata.datasourceId, metadata.datasourceType);

      // File-based datasources need data provider
      if (!metadata.dataProvider) {
        return {
          success: false,
          error: 'File-based datasource requires dataProvider'
        };
      }

      // Create WMS callback using the publisher
      const wmsCallback = await publisher.createWMSService(
        layerId,
        metadata.dataProvider,
        metadata.options
      );

      // Store the callback for later retrieval
      this.wmsCallbacks.set(layerId, wmsCallback);
      console.log(`✅ Published WMS layer: ${layerId}`);
      console.log(`   Total callbacks registered: ${this.wmsCallbacks.size}`);
      console.log(`   Callback keys:`, Array.from(this.wmsCallbacks.keys()));

      return {
        success: true,
        layerId,
        wmsUrl: `/api/wms?SERVICE=WMS&REQUEST=GetMap&LAYERS=${layerId}&BBOX={bbox}&WIDTH={width}&HEIGHT={height}&CRS=EPSG:4326&FORMAT=image/png`
      };

    } catch (error: any) {
      console.error('❌ Failed to publish datasource to WMS:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get WMS callback for a layer
   * 
   * @param layerId - Unique layer identifier
   * @returns WMS callback or undefined if not found
   */
  static getWMSCallback(layerId: string): WMSMapCallback | undefined {
    return this.wmsCallbacks.get(layerId);
  }

  /**
   * Unpublish a layer
   * 
   * @param layerId - Layer to unpublish
   * @returns true if layer was found and removed
   */
  static unpublish(layerId: string): boolean {
    const removed = this.wmsCallbacks.delete(layerId);
    if (removed) {
      console.log(`🗑️ Unpublished WMS layer: ${layerId}`);
    }
    return removed;
  }

  /**
   * List all published layers
   * 
   * @returns Array of layer IDs
   */
  static listPublishedLayers(): string[] {
    return Array.from(this.wmsCallbacks.keys());
  }

  /**
   * Clear all published layers and caches
   */
  static clearAll(): void {
    this.wmsCallbacks.clear();
    this.publishers.forEach((publisher) => {
      publisher.clearCache();
    });
    console.log('🧹 Cleared all WMS publications and caches');
  }

  /**
   * Get or create a publisher for the given datasource type
   */
  private static getOrCreatePublisher(datasourceType: string): IWMSPublisher {
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
  private static createPublisher(datasourceType: string): IWMSPublisher {
    switch (datasourceType) {
      case 'tiff':
      case 'geotiff':
        return new GDALTIFFWMSPublisher();
      
      default:
        throw new Error(`Unsupported datasource type for WMS: ${datasourceType}`);
    }
  }

  /**
   * Generate unique layer ID from datasource ID and type
   */
  private static generateLayerId(datasourceId: string, datasourceType: string): string {
    return `wms_${datasourceType}_${datasourceId}`;
  }

  /**
   * Check if a datasource type supports WMS publishing
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
    return ['tiff', 'geotiff'];
  }
}
