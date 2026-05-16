import { InMemoryServiceRegistry } from './ServiceRegistry';
import { MVTStrategyPublisher } from '../../publishers/MVTStrategyPublisher';
import { WMSPublisher } from '../../publishers/WMSPublisher';
import type { 
  VisualizationServiceInfo, 
  ServicePublishResult, 
  ServiceType 
} from './types';
import type { MVTSource, MVTTileOptions } from '../../publishers/base/MVTPublisherTypes';
import type { WMSLayerOptions } from '../../publishers/base/WMSStategies/WMSPublisherTypes';
import type { NativeData } from '../../core';
import type Database from 'better-sqlite3';
import { 
  DEFAULT_MVT_TTL, 
  DEFAULT_WMS_TTL, 
  DEFAULT_GEOJSON_TTL, 
  DEFAULT_REPORT_TTL,
  CLEANUP_INTERVAL_MS 
} from './constant';

export class VisualizationServicePublisher {
  private static instance: VisualizationServicePublisher | null = null;

  private registry: InMemoryServiceRegistry;
  private mvtPublisher: MVTStrategyPublisher;
  private wmsPublisher: WMSPublisher;
  private workspaceBase: string;
  private db?: Database.Database;

  // Cleanup interval (check every 5 minutes)
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor(workspaceBase: string, db?: Database.Database) {
    this.workspaceBase = workspaceBase;
    this.db = db;
    this.registry = new InMemoryServiceRegistry(db);

    // Initialize publishers
    this.mvtPublisher = MVTStrategyPublisher.getInstance(workspaceBase, db);
    this.wmsPublisher = WMSPublisher.getInstance(workspaceBase, db);

    // Start automatic cleanup
    this.startCleanupTimer();

    console.log('[VisualizationServicePublisher] Initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(workspaceBase: string, db?: Database.Database): VisualizationServicePublisher {
    if (!VisualizationServicePublisher.instance) {
      VisualizationServicePublisher.instance = new VisualizationServicePublisher(workspaceBase, db);
    }
    return VisualizationServicePublisher.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    if (VisualizationServicePublisher.instance) {
      VisualizationServicePublisher.instance.stopCleanupTimer();
    }
    VisualizationServicePublisher.instance = null;
  }

  // ============================================================================
  // Publishing Methods
  // ============================================================================

  /**
   * Publish MVT service from NativeData (unified data abstraction)
   * This is the preferred method for workflow execution
   */
  async publishMVTFromNativeData(
    nativeData: NativeData,
    options: MVTTileOptions,
    serviceId?: string,
    ttl?: number
  ): Promise<ServicePublishResult> {
    try {
      console.log(`[VisualizationServicePublisher] Publishing MVT from NativeData:`, {
        id: nativeData.id,
        type: nativeData.type,
        reference: nativeData.reference
      });

      // Delegate to underlying publisher
      const result = await this.mvtPublisher.publish(nativeData, options);

      console.log(`[VisualizationServicePublisher] Publisher result:`, {
        success: result.success,
        tilesetId: result.tilesetId,
        serviceUrl: result.serviceUrl
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error
        };
      }

      // Use custom TTL or default to 1 hour
      const effectiveTtl = ttl || DEFAULT_MVT_TTL;

      const metadata: VisualizationServiceInfo = {
        id: result.tilesetId,
        type: 'mvt',
        url: `/api/services/mvt/${result.tilesetId}/{z}/{x}/{y}.pbf`,
        createdAt: new Date(),
        ttl: effectiveTtl,
        expiresAt: new Date(Date.now() + effectiveTtl),
        metadata: result.metadata
      };

      console.log(`[VisualizationServicePublisher] Registering service:`, {
        id: metadata.id,
        type: metadata.type,
        url: metadata.url
      });

      this.registry.register(metadata);

      return {
        success: true,
        serviceId: result.tilesetId,
        url: metadata.url,
        metadata
      };
    } catch (error) {
      console.error('[VisualizationServicePublisher] MVT publish from NativeData failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish MVT service from various data sources (legacy API)
   * Converts MVTSource to NativeData internally
   */
  async publishMVT(
    source: MVTSource,
    options: MVTTileOptions,
    serviceId?: string,
    ttl?: number
  ): Promise<ServicePublishResult> {
    try {
      // Convert MVTSource format to NativeData format
      let nativeData: NativeData;
      
      if (source.type === 'postgis') {
        nativeData = {
          id: serviceId || 'temp-postgis',
          type: 'postgis',
          reference: source.tableName || '',
          metadata: {
            connection: source.connection,
            tableName: source.tableName,
            sqlQuery: source.sqlQuery,
            geometryColumn: source.geometryColumn || 'geom'
          } as any,
          createdAt: new Date()
        };
      } else if (source.type === 'geojson-file') {
        nativeData = {
          id: serviceId || 'temp-geojson',
          type: 'geojson',
          reference: source.filePath,
          metadata: {} as any,
          createdAt: new Date()
        };
      } else {
        throw new Error(`Unsupported MVT source type: ${(source as any).type}`);
      }

      // Delegate to the unified method
      return this.publishMVTFromNativeData(nativeData, options, serviceId, ttl);
    } catch (error) {
      console.error('[VisualizationServicePublisher] MVT publish failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish WMS service from raster data
   */
  async publishWMS(
    nativeData: NativeData,
    options: WMSLayerOptions
  ): Promise<ServicePublishResult> {
    try {
      const generatedServiceId = await this.wmsPublisher.generateService(nativeData, options);

      const metadata: VisualizationServiceInfo = {
        id: generatedServiceId,
        type: 'wms',
        url: `/api/services/wms/${generatedServiceId}`,
        createdAt: new Date(),
        ttl: DEFAULT_WMS_TTL,
        expiresAt: new Date(Date.now() + DEFAULT_WMS_TTL),
        metadata: {
          name: options.name,
          title: options.title
        }
      };

      this.registry.register(metadata);

      return {
        success: true,
        serviceId: generatedServiceId,
        url: metadata.url,
        metadata
      };
    } catch (error) {
      console.error('[VisualizationServicePublisher] WMS publish failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish GeoJSON result as downloadable file
   */
  publishGeoJSON(
    stepId: string,
    geojsonData: any,
    ttl: number = DEFAULT_GEOJSON_TTL
  ): ServicePublishResult {
    try {
      const metadata: VisualizationServiceInfo = {
        id: stepId,
        type: 'geojson',
        url: `/api/results/${stepId}.geojson`,
        createdAt: new Date(),
        ttl,
        expiresAt: new Date(Date.now() + ttl),
        // Include all metadata from the operator result (styleConfig, geometryType, etc.)
        metadata: geojsonData?.metadata || {}
      };

      this.registry.register(metadata);

      return {
        success: true,
        serviceId: stepId,
        url: metadata.url,
        metadata
      };
    } catch (error) {
      console.error('[VisualizationServicePublisher] GeoJSON publish failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish report as markdown file
   */
  publishReport(
    stepId: string,
    reportContent: string,
    ttl: number = DEFAULT_REPORT_TTL
  ): ServicePublishResult {
    try {
      const metadata: VisualizationServiceInfo = {
        id: stepId,
        type: 'report',
        url: `/api/results/reports/${stepId}.md`,
        createdAt: new Date(),
        ttl,
        expiresAt: new Date(Date.now() + ttl)
      };

      this.registry.register(metadata);

      return {
        success: true,
        serviceId: stepId,
        url: metadata.url,
        metadata
      };
    } catch (error) {
      console.error('[VisualizationServicePublisher] Report publish failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ============================================================================
  // Service Management Methods
  // ============================================================================

  /**
   * Get service metadata by ID
   */
  getService(serviceId: string): VisualizationServiceInfo | null {
    return this.registry.get(serviceId);
  }

  /**
   * List all services or filter by type
   */
  listServices(type?: ServiceType): VisualizationServiceInfo[] {
    return this.registry.list(type);
  }

  /**
   * Unpublish/remove a service
   */
  unpublish(serviceId: string): boolean {
    const service = this.registry.get(serviceId);
    if (!service) {
      return false;
    }

    // Clean up underlying resources
    if (service.type === 'mvt') {
      this.mvtPublisher.deleteTileset(serviceId);
    } else if (service.type === 'wms') {
      this.wmsPublisher.deleteService(serviceId);
    }

    // Remove from registry
    this.registry.unregister(serviceId);

    console.log(`[VisualizationServicePublisher] Unpublished service: ${serviceId}`);
    return true;
  }

  /**
   * Check if service exists
   */
  hasService(serviceId: string): boolean {
    return this.registry.get(serviceId) !== null;
  }

  // ============================================================================
  // TTL Management and Cleanup
  // ============================================================================

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupInterval) {
      return; // Already running
    }

    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, CLEANUP_INTERVAL_MS);

    console.log(`[VisualizationServicePublisher] Started cleanup timer (interval: ${CLEANUP_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[VisualizationServicePublisher] Stopped cleanup timer');
    }
  }

  /**
   * Perform cleanup of expired services
   */
  private performCleanup(): void {
    const expiredServices = this.registry.getExpiredServices();

    if (expiredServices.length === 0) {
      return;
    }

    console.log(`[VisualizationServicePublisher] Cleaning up ${expiredServices.length} expired services`);

    for (const service of expiredServices) {
      try {
        this.unpublish(service.id);
      } catch (error) {
        console.error(`[VisualizationServicePublisher] Failed to cleanup service ${service.id}:`, error);
      }
    }
  }

  /**
   * Manually trigger cleanup
   */
  cleanupExpiredServices(): number {
    const expiredServices = this.registry.getExpiredServices();
    const count = expiredServices.length;

    for (const service of expiredServices) {
      try {
        this.unpublish(service.id);
      } catch (error) {
        console.error(`[VisualizationServicePublisher] Failed to cleanup service ${service.id}:`, error);
      }
    }

    console.log(`[VisualizationServicePublisher] Manual cleanup completed: ${count} services removed`);
    return count;
  }

  // ============================================================================
  // MVT Service Methods (Delegate to Publisher)
  // ============================================================================

  /**
   * Get MVT tile by delegating to underlying publisher
   */
  async getMVTTile(
    tilesetId: string,
    z: number,
    x: number,
    y: number
  ): Promise<Buffer | null> {
    console.log(`[VisualizationServicePublisher] getMVTTile called: ${tilesetId}/${z}/${x}/${y}`);
    
    // Update access tracking
    const service = this.registry.get(tilesetId);
    console.log(`[VisualizationServicePublisher] Registry lookup result:`, service ? `found (${service.type})` : 'NOT FOUND');
    
    if (!service || service.type !== 'mvt') {
      console.warn(`[VisualizationServicePublisher] Service not found or wrong type: ${tilesetId}`);
      return null;
    }

    // Delegate to MVT publisher
    console.log(`[VisualizationServicePublisher] Delegating to MVT publisher...`);
    const tileBuffer = await this.mvtPublisher.getTile(tilesetId, z, x, y);
    console.log(`[VisualizationServicePublisher] Tile result:`, tileBuffer ? `${tileBuffer.length} bytes` : 'NULL');

    return tileBuffer;
  }

  /**
   * Get MVT metadata with enhanced service info
   */
  getMVTMetadata(tilesetId: string): any | null {
    // First try registry (has TTL, access tracking)
    const service = this.registry.get(tilesetId);

    if (service && service.type === 'mvt') {
      // Merge registry info with publisher metadata
      const publisherMetadata = this.mvtPublisher.getMetadata(tilesetId);

      return {
        ...publisherMetadata,
        // Enhanced with service lifecycle info
        serviceId: service.id,
        createdAt: service.createdAt,
        expiresAt: service.expiresAt,
        ttl: service.ttl,
        lastAccessedAt: service.lastAccessedAt,
        accessCount: service.accessCount
      };
    }

    // Fallback to publisher only
    return this.mvtPublisher.getMetadata(tilesetId);
  }

  /**
   * List all MVT services with enhanced info
   */
  listMVTServices(): VisualizationServiceInfo[] {
    return this.registry.list('mvt');
  }

  /**
   * Delete MVT service and clean up resources
   */
  deleteMVTService(tilesetId: string): boolean {
    const service = this.registry.get(tilesetId);

    if (!service || service.type !== 'mvt') {
      return false;
    }

    // Clean up underlying tileset
    this.mvtPublisher.deleteTileset(tilesetId);

    // Remove from registry
    this.registry.unregister(tilesetId);

    console.log(`[VisualizationServicePublisher] Deleted MVT service: ${tilesetId}`);
    return true;
  }

  // ============================================================================
  // Health and Metrics
  // ============================================================================

  /**
   * Get health status of the publisher
   */
  getHealthStatus(): {
    totalServices: number;
    servicesByType: Record<ServiceType, number>;
    expiredServices: number;
    uptime: string;
  } {
    const allServices = this.registry.list();
    const expiredServices = this.registry.getExpiredServices();

    const servicesByType: Record<ServiceType, number> = {
      mvt: 0,
      wms: 0,
      geojson: 0,
      report: 0
    };

    for (const service of allServices) {
      servicesByType[service.type]++;
    }

    return {
      totalServices: allServices.length,
      servicesByType,
      expiredServices: expiredServices.length,
      uptime: this.cleanupInterval ? 'active' : 'inactive'
    };
  }

  /**
   * Shutdown and cleanup all resources
   */
  shutdown(): void {
    this.stopCleanupTimer();
    this.registry.clear();
    console.log('[VisualizationServicePublisher] Shutdown complete');
  }
}
