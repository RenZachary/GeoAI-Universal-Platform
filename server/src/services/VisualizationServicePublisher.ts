/**
 * VisualizationServicePublisher - Unified interface for all visualization services
 * 
 * Provides a single entry point for publishing, managing, and cleaning up
 * visualization services (MVT, WMS, GeoJSON, Reports).
 * 
 * Architecture:
 * - Strategy Pattern: Different publishers for different service types
 * - Singleton: Centralized service registry and lifecycle management
 * - TTL Management: Automatic expiration and cleanup of unused services
 * - Health Monitoring: Track service usage and performance metrics
 */

import type Database from 'better-sqlite3';
import { MVTStrategyPublisher } from '../utils/publishers/MVTStrategyPublisher';
import { WMSPublisher } from '../utils/publishers/WMSPublisher';
import type { MVTSource, MVTTileOptions } from '../utils/publishers/base/MVTPublisherTypes';
import type { NativeData } from '../core';
import type { WMSLayerOptions } from '../utils/publishers/base/WMSStategies/WMSPublisherTypes';

// ============================================================================
// Type Definitions
// ============================================================================

export type ServiceType = 'mvt' | 'wms' | 'geojson' | 'report';

/**
 * Visualization Service Info - Platform service lifecycle metadata
 * 
 * Tracks service registration, access patterns, and expiration.
 * NOT to be confused with core ServiceMetadata which is for rendering configuration.
 */
export interface VisualizationServiceInfo {
  id: string;
  type: ServiceType;
  url: string;
  createdAt: Date;
  expiresAt?: Date;
  ttl?: number; // Time-to-live in milliseconds
  lastAccessedAt?: Date;
  accessCount?: number;
  metadata?: Record<string, any>;
}

export interface ServicePublishResult {
  success: boolean;
  serviceId?: string;
  url?: string;
  error?: string;
  metadata?: VisualizationServiceInfo;
}

export interface ServiceRegistry {
  get(serviceId: string): VisualizationServiceInfo | null;
  list(type?: ServiceType): VisualizationServiceInfo[];
  register(metadata: VisualizationServiceInfo): void;
  unregister(serviceId: string): void;
  updateLastAccessed(serviceId: string): void;
}

// ============================================================================
// In-Memory Service Registry with SQLite Persistence
// ============================================================================

export class InMemoryServiceRegistry implements ServiceRegistry {
  private services: Map<string, VisualizationServiceInfo> = new Map();
  private db?: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db;
    if (db) {
      this.initializeDatabase();
    }
  }

  private initializeDatabase(): void {
    if (!this.db) {
      console.warn('[ServiceRegistry] Database is not initialized');
      return;
    }
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS visualization_services (
          service_id TEXT PRIMARY KEY,
          service_type TEXT NOT NULL,
          url TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          ttl INTEGER,
          last_accessed_at DATETIME,
          access_count INTEGER DEFAULT 0,
          metadata_json TEXT
        )
      `);

      // Load existing services from database
      this.loadFromDatabase();
    } catch (error) {
      console.error('[ServiceRegistry] Failed to initialize database:', error);
    }
  }

  private loadFromDatabase(): void {
    try {
      if (!this.db) {
        console.warn('[ServiceRegistry] Database is not initialized');
        return;
      }
      const rows = this.db.prepare('SELECT * FROM visualization_services').all() as any[];
      for (const row of rows) {
        const metadata: VisualizationServiceInfo = {
          id: row.service_id,
          type: row.service_type,
          url: row.url,
          createdAt: new Date(row.created_at),
          expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
          ttl: row.ttl,
          lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined,
          accessCount: row.access_count || 0,
          metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined
        };
        this.services.set(metadata.id, metadata);
      }
      console.log(`[ServiceRegistry] Loaded ${this.services.size} services from database`);
    } catch (error) {
      console.error('[ServiceRegistry] Failed to load services from database:', error);
    }
  }

  get(serviceId: string): VisualizationServiceInfo | null {
    const service = this.services.get(serviceId);
    if (service) {
      // Update access tracking
      service.lastAccessedAt = new Date();
      service.accessCount = (service.accessCount || 0) + 1;

      // Persist to database if available
      if (this.db) {
        this.persistToDatabase(service);
      }
    }
    return service || null;
  }

  list(type?: ServiceType): VisualizationServiceInfo[] {
    const services = Array.from(this.services.values());
    return type ? services.filter(s => s.type === type) : services;
  }

  register(metadata: VisualizationServiceInfo): void {
    this.services.set(metadata.id, metadata);

    // Persist to database if available
    if (this.db) {
      this.persistToDatabase(metadata);
    }
  }

  unregister(serviceId: string): void {
    this.services.delete(serviceId);

    // Remove from database if available
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM visualization_services WHERE service_id = ?').run(serviceId);
      } catch (error) {
        console.error('[ServiceRegistry] Failed to delete service from database:', error);
      }
    }
  }

  updateLastAccessed(serviceId: string): void {
    const service = this.services.get(serviceId);
    if (service) {
      service.lastAccessedAt = new Date();
      service.accessCount = (service.accessCount || 0) + 1;

      if (this.db) {
        this.persistToDatabase(service);
      }
    }
  }

  private persistToDatabase(metadata: VisualizationServiceInfo): void {
    try {
      if (!this.db) {
        console.warn('[ServiceRegistry] Database is not initialized');
        return;
      }
      this.db.prepare(`
        INSERT OR REPLACE INTO visualization_services 
        (service_id, service_type, url, created_at, expires_at, ttl, last_accessed_at, access_count, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        metadata.id,
        metadata.type,
        metadata.url,
        metadata.createdAt.toISOString(),
        metadata.expiresAt?.toISOString(),
        metadata.ttl,
        metadata.lastAccessedAt?.toISOString(),
        metadata.accessCount,
        metadata.metadata ? JSON.stringify(metadata.metadata) : null
      );
    } catch (error) {
      console.error('[ServiceRegistry] Failed to persist service to database:', error);
    }
  }

  /**
   * Get expired services for cleanup
   */
  getExpiredServices(): VisualizationServiceInfo[] {
    const now = new Date();
    return Array.from(this.services.values()).filter(service => {
      if (service.expiresAt && service.expiresAt < now) {
        return true;
      }
      return false;
    });
  }

  /**
   * Clear all services (for testing)
   */
  clear(): void {
    this.services.clear();
    if (this.db) {
      try {
        this.db.exec('DELETE FROM visualization_services');
      } catch (error) {
        console.error('[ServiceRegistry] Failed to clear database:', error);
      }
    }
  }
}

// ============================================================================
// Unified Visualization Service Publisher
// ============================================================================

export class VisualizationServicePublisher {
  private static instance: VisualizationServicePublisher | null = null;

  private registry: InMemoryServiceRegistry;
  private mvtPublisher: MVTStrategyPublisher;  // Changed to use new strategy-based publisher
  private wmsPublisher: WMSPublisher;
  private workspaceBase: string;
  private db?: Database.Database;

  // Cleanup interval (check every 5 minutes)
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

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
      const effectiveTtl = ttl || 3600000;

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
    ttl?: number  // Optional custom TTL (default: 1 hour)
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
        ttl: 3600000, // Default 1 hour
        expiresAt: new Date(Date.now() + 3600000),
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
    ttl: number = 3600000
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
    ttl: number = 86400000 // Default 24 hours for reports
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
    }, this.CLEANUP_INTERVAL_MS);

    console.log(`[VisualizationServicePublisher] Started cleanup timer (interval: ${this.CLEANUP_INTERVAL_MS / 1000}s)`);
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
