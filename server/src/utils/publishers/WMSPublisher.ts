/**
 * WMS Publisher - Generates Web Map Service (WMS) endpoints for raster data
 * Supports GeoTIFF with dynamic map rendering and coordinate transformation
 * 
 * Architecture:
 * - BaseWMSPublisher: Abstract base class defining the interface
 * - WMSGenerationStrategy: Strategy pattern for different data source types
 * - GeoTIFFWMSStategy: Concrete implementation for GeoTIFF files using GDAL
 */

import fs from 'fs';
import path from 'path';
import type { DataSourceType, NativeData } from '../../core/index';
import type Database from 'better-sqlite3';
import { DataSourceRepository } from '../../data-access/repositories';
import type { WMSGenerationStrategy } from './base/BaseWMSPublisher';
import { BaseWMSPublisher } from './base/BaseWMSPublisher';
import {
  type WMSLayerOptions,
  type WMSGetMapParams,
  type WMSServiceMetadata,
  type WMSPublishResult
} from './base/WMSStategies/WMSPublisherTypes';
import { GeoTIFFWMSStategy } from './base/WMSStategies/GeoTIFFWMSStategy';

// Re-export types for backward compatibility
export type { WMSLayerOptions, WMSGetMapParams, WMSServiceMetadata, WMSPublishResult };
export { WMSGenerationStrategy };

export class WMSPublisher extends BaseWMSPublisher {
  private static instance: WMSPublisher | null = null;
  
  /**
   * Get the singleton instance of WMSPublisher
   * @param workspaceBase - Workspace base directory
   * @param db - Database instance
   * @returns WMSPublisher singleton instance
   */
  static getInstance(workspaceBase: string, db?: Database.Database): WMSPublisher {
    if (!WMSPublisher.instance) {
      WMSPublisher.instance = new WMSPublisher(workspaceBase, db);
    }
    return WMSPublisher.instance;
  }
  
  /**
   * Reset the singleton instance (for testing purposes)
   */
  static resetInstance(): void {
    WMSPublisher.instance = null;
  }
  private db?: Database.Database;
  private strategies: Map<DataSourceType, WMSGenerationStrategy>;

  constructor(workspaceBase: string, db?: Database.Database) {
    super(workspaceBase, 'wms');
    this.db = db;
    
    // Register default strategies - WMS only supports raster (GeoTIFF)
    this.strategies = new Map();
    this.registerStrategy('tif', new GeoTIFFWMSStategy(this.wmsOutputDir));
    
    // Load existing WMS services from disk into cache
    void this.loadExistingServices();
    
    console.log('[WMS Publisher] Initialized');
  }
  
  /**
   * Load existing WMS services from disk into memory cache
   * This ensures services persist across server restarts
   */
  private async loadExistingServices(): Promise<void> {
    try {
      if (!fs.existsSync(this.wmsOutputDir)) {
        return;
      }
      
      const entries = fs.readdirSync(this.wmsOutputDir, { withFileTypes: true });
      let loadedCount = 0;
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metadataPath = path.join(this.wmsOutputDir, entry.name, 'metadata.json');
          if (fs.existsSync(metadataPath)) {
            try {
              const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
              
              // Get the strategy for this service type
              const strategy = this.strategies.get(metadata.dataSourceType);
              if (strategy && strategy instanceof GeoTIFFWMSStategy) {
                // Load the service into the strategy's cache
                const sourceReference = this.findSourceFile(metadata);
                
                if (sourceReference) {
                  // Reconstruct cache entry
                  await (strategy as GeoTIFFWMSStategy).restoreServiceFromMetadata(entry.name, {
                    sourceReference,
                    options: {
                      name: metadata.layers?.[0]?.name || 'raster',
                      title: metadata.layers?.[0]?.title || 'GeoTIFF Layer',
                      abstract: metadata.layers?.[0]?.abstract || 'Raster layer from GeoTIFF'
                    },
                    bbox: metadata.layers?.[0]?.bbox || [0, 0, 1, 1],
                    srs: metadata.layers?.[0]?.srs || 'EPSG:4326',  // Will be transformed to EPSG:3857
                    sourceSRS: metadata.layers?.[0]?.srs || 'EPSG:4326',  // Original source CRS
                    width: metadata.layers?.[0]?.width,
                    height: metadata.layers?.[0]?.height,
                    resolution: [0.0001, 0.0001], // Placeholder
                    createdAt: new Date(metadata.generatedAt).getTime()
                  });
                  
                  loadedCount++;
                }
              }
            } catch (error) {
              console.error(`[WMS Publisher] Failed to load service ${entry.name}:`, error);
            }
          }
        }
      }
      
      if (loadedCount > 0) {
        console.log(`[WMS Publisher] Loaded ${loadedCount} existing WMS services from disk`);
      }
    } catch (error) {
      console.error('[WMS Publisher] Failed to load existing services:', error);
    }
  }
  
  /**
   * Find the source file for a WMS service
   */
  private findSourceFile(metadata: WMSServiceMetadata): string | null {
    if (!this.db) {
      return null;
    }
    
    try {
      const repo = new DataSourceRepository(this.db);
      const allSources = repo.listAll();
      
      // Try to find by wmsServiceId first
      for (const source of allSources) {
        if (source.type === 'tif' && source.metadata?.wmsServiceId === metadata.id) {
          return source.reference;
        }
      }
      
      // Fallback: try to find by bbox matching
      const serviceBbox = metadata.layers?.[0]?.bbox;
      if (serviceBbox) {
        for (const source of allSources) {
          if (source.type === 'tif' && source.metadata?.bbox) {
            const dbBbox = source.metadata.bbox;
            if (Math.abs(dbBbox[0] - serviceBbox[0]) < 0.001 &&
                Math.abs(dbBbox[1] - serviceBbox[1]) < 0.001 &&
                Math.abs(dbBbox[2] - serviceBbox[2]) < 0.001 &&
                Math.abs(dbBbox[3] - serviceBbox[3]) < 0.001) {
              return source.reference;
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('[WMS Publisher] Error finding source file:', error);
      return null;
    }
  }
  
  /**
   * Register a custom WMS generation strategy
   */
  registerStrategy(type: DataSourceType, strategy: WMSGenerationStrategy): void {
    this.strategies.set(type, strategy);
  }
  
  /**
   * Get strategy for a data source type
   */
  private getStrategy(type: DataSourceType): WMSGenerationStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(`No WMS generation strategy registered for data type: ${type}`);
    }
    return strategy;
  }

  /**
   * Publish WMS service from NativeData reference
   */
  async publish(
    sourceReference: string,
    dataSourceType: DataSourceType,
    options: WMSLayerOptions = {}
  ): Promise<WMSPublishResult> {
    try {
      const strategy = this.getStrategy(dataSourceType);
      const serviceId = await strategy.generateService(sourceReference, dataSourceType, options);
      
      const metadata = this.getServiceMetadata(serviceId);
      
      return {
        success: true,
        serviceId,
        serviceUrl: `/api/services/wms/${serviceId}`,
        metadata: metadata || undefined
      };
    } catch (error: any) {
      console.error('[WMS Publisher] Publication failed:', error);
      return {
        success: false,
        serviceId: '',
        serviceUrl: '',
        error: error.message
      };
    }
  }

  /**
   * Generate WMS service from NativeData reference (legacy method)
   */
  async generateService(
    nativeData: NativeData,
    options: WMSLayerOptions = {}
  ): Promise<string> {
    const strategy = this.getStrategy(nativeData.type);
    return strategy.generateService(nativeData.reference, nativeData.type, options);
  }

  /**
   * Get map image for GetMap request
   */
  async getMap(serviceId: string, params: WMSGetMapParams): Promise<Buffer | null> {
    const metadata = this.getServiceMetadata(serviceId);
    
    if (!metadata) {
      return null;
    }
    
    const strategy = this.getStrategy(metadata.dataSourceType);
    
    if (strategy.getMap) {
      return strategy.getMap(serviceId, params);
    }
    
    return null;
  }

  /**
   * Get WMS capabilities XML
   */
  async getCapabilities(serviceId: string): Promise<string | null> {
    const metadata = this.getServiceMetadata(serviceId);
    
    if (!metadata) {
      return null;
    }
    
    const strategy = this.getStrategy(metadata.dataSourceType);
    
    if (strategy.getCapabilities) {
      return strategy.getCapabilities(serviceId);
    }
    
    return null;
  }

  /**
   * List all available WMS services
   */
  listServices(): Array<{ id: string; metadata: WMSServiceMetadata }> {
    if (!fs.existsSync(this.wmsOutputDir)) {
      return [];
    }

    const services: Array<{ id: string; metadata: WMSServiceMetadata }> = [];
    const entries = fs.readdirSync(this.wmsOutputDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(this.wmsOutputDir, entry.name, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          services.push({ id: entry.name, metadata });
        }
      }
    }

    return services;
  }

  /**
   * Delete a WMS service
   */
  deleteService(serviceId: string): boolean {
    const serviceDir = path.join(this.wmsOutputDir, serviceId);
    
    if (fs.existsSync(serviceDir)) {
      fs.rmSync(serviceDir, { recursive: true, force: true });
      return true;
    }
    
    return false;
  }
}
