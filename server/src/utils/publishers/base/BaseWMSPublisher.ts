/**
 * Base WMS Publisher - Abstract base class for all WMS publishers
 * 
 * Defines the common interface for Web Map Service generation
 */

import fs from 'fs';
import path from 'path';
import type { DataSourceType } from '../../../core/index';
import type {
  WMSLayerOptions,
  WMSGetMapParams,
  WMSServiceMetadata,
  WMSPublishResult
} from './WMSPublisherTypes';

/**
 * Strategy interface for WMS map generation
 */
export interface WMSGenerationStrategy {
  /**
   * Generate WMS service from a data source
   * @param sourceReference - Data source reference (file path, connection string, etc.)
   * @param dataSourceType - Type of data source
   * @param options - WMS layer options
   * @returns serviceId - Unique identifier for the WMS service
   */
  generateService(
    sourceReference: string,
    dataSourceType: DataSourceType,
    options: WMSLayerOptions
  ): Promise<string>;
  
  /**
   * Get map image for GetMap request
   * @param serviceId - Service identifier
   * @param params - GetMap parameters
   * @returns Image buffer or null if failed
   */
  getMap?(serviceId: string, params: WMSGetMapParams): Promise<Buffer | null>;
  
  /**
   * Get WMS capabilities XML
   * @param serviceId - Service identifier
   * @returns Capabilities XML string
   */
  getCapabilities?(serviceId: string): Promise<string>;
}

/**
 * Abstract base class for WMS publishers
 * All WMS publisher implementations should extend this class
 */
export abstract class BaseWMSPublisher {
  protected workspaceBase: string;
  protected wmsOutputDir: string;

  constructor(workspaceBase: string, outputSubdir: string = 'wms') {
    this.workspaceBase = workspaceBase;
    this.wmsOutputDir = this.ensureOutputDir(outputSubdir);
  }

  /**
   * Ensure output directory exists
   */
  protected ensureOutputDir(subdir: string): string {
    const dir = path.join(this.workspaceBase, 'results', subdir);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    return dir;
  }

  /**
   * Publish/generate WMS service from a data source
   * @param sourceReference - Data source reference
   * @param dataSourceType - Type of data source
   * @param options - WMS layer options
   * @returns Publish result with service ID and URL
   */
  abstract publish(
    sourceReference: string,
    dataSourceType: DataSourceType,
    options?: WMSLayerOptions
  ): Promise<WMSPublishResult>;

  /**
   * Get map image for GetMap request
   * @param serviceId - Service identifier
   * @param params - GetMap parameters
   * @returns Image buffer or null if failed
   */
  abstract getMap(serviceId: string, params: WMSGetMapParams): Promise<Buffer | null>;

  /**
   * Get WMS capabilities XML
   * @param serviceId - Service identifier
   * @returns Capabilities XML string or null
   */
  abstract getCapabilities(serviceId: string): Promise<string | null>;

  /**
   * List all published WMS services
   */
  abstract listServices(): Array<{ id: string; metadata: WMSServiceMetadata }>;

  /**
   * Delete a WMS service and clean up resources
   * @param serviceId - Service identifier to delete
   * @returns true if deleted successfully
   */
  abstract deleteService(serviceId: string): boolean;

  /**
   * Get service metadata
   * @param serviceId - Service identifier
   * @returns Metadata object or null if not found
   */
  getServiceMetadata(serviceId: string): WMSServiceMetadata | null {
    const metadataPath = path.join(this.wmsOutputDir, serviceId, 'metadata.json');
    
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      return metadata;
    }
    
    return null;
  }

  /**
   * Save service metadata to disk
   */
  protected saveMetadata(serviceId: string, metadata: WMSServiceMetadata): void {
    const serviceDir = path.join(this.wmsOutputDir, serviceId);
    
    if (!fs.existsSync(serviceDir)) {
      fs.mkdirSync(serviceDir, { recursive: true });
    }

    const metadataPath = path.join(serviceDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }
}
