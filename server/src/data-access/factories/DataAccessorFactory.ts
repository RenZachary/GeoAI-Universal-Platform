/**
 * Data Accessor Factory - Creates appropriate accessor based on data type
 * Implements singleton pattern for accessor reuse
 */

import type { DataSourceType } from '../../core';
import type { DataAccessor } from '../interfaces';
import { ShapefileAccessor } from '../accessors/ShapefileAccessor';
import { GeoJSONAccessor } from '../accessors/GeoJSONAccessor';
import type { PostGISConnectionConfig } from '../accessors/PostGISAccessor';
import { PostGISAccessor } from '../accessors/PostGISAccessor';
import { GeoTIFFAccessor } from '../accessors/GeoTIFFAccessor';

export class DataAccessorFactory {
  private accessors: Map<DataSourceType, DataAccessor> = new Map();
  
  // Configuration for specialized accessors
  private postGISConfig?: PostGISConnectionConfig;
  private workspaceBase: string;
  
  constructor(workspaceBase?: string) {
    this.workspaceBase = workspaceBase || process.cwd();
    // Initialize accessors lazily (on first request)
  }
  
  /**
   * Configure PostGIS connection (optional)
   */
  configurePostGIS(config: PostGISConnectionConfig): void {
    this.postGISConfig = config;
    // Clear cached accessor if exists
    this.accessors.delete('postgis');
  }
  
  /**
   * Create or retrieve accessor for given type
   */
  createAccessor(type: DataSourceType,config?: PostGISConnectionConfig): DataAccessor {
    // Check if accessor already exists
    if (this.accessors.has(type)) {
      return this.accessors.get(type) as DataAccessor;
    }
    
    // Create new accessor based on type
    let accessor: DataAccessor;
    
    switch (type) {
      case 'shapefile':
        accessor = new ShapefileAccessor(this.workspaceBase);
        break;
      case 'geojson':
        accessor = new GeoJSONAccessor(this.workspaceBase);
        break;
      case 'postgis':
        if (config) this.configurePostGIS(config);
        if (!this.postGISConfig) {
          throw new Error('PostGIS not configured. Call configurePostGIS() first.');
        }
        accessor = new PostGISAccessor(this.postGISConfig);
        break;
      case 'tif':
        accessor = new GeoTIFFAccessor();
        break;
      default:
        throw new Error(`Unsupported data source type: ${type}`);
    }
    
    // Cache accessor for future use
    this.accessors.set(type, accessor);
    
    return accessor;
  }
  
  /**
   * Get all supported data source types
   */
  getSupportedTypes(): DataSourceType[] {
    return ['shapefile', 'geojson', 'postgis', 'tif', 'mvt', 'wms'];
  }
  
  /**
   * Check if a data source type is supported
   */
  isSupported(type: DataSourceType): boolean {
    return this.getSupportedTypes().includes(type);
  }
}
