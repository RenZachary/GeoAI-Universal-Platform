/**
 * Data Source Publishing Service
 * 
 * Automatically publishes data sources as MVT (for vector) or WMS (for raster) services
 */

import type Database from 'better-sqlite3';
import { DataSourceRepository, type DataSourceRecord } from '../data-access/repositories';
import { MVTOnDemandPublisher } from '../utils/publishers/MVTOnDemandPublisher';
import { type MVTSource, type MVTTileOptions, type MVTPublishMetadata } from '../utils/publishers/base/MVTPublisherTypes';
import { WMSPublisher } from '../utils/publishers/WMSPublisher';
import { ShapefileAccessor } from '../data-access';
import fs from 'fs';

export interface PublishedServiceInfo {
  dataSourceId: string;
  serviceType: 'mvt' | 'wms';
  serviceUrl: string;
  tilesetId?: string;
  serviceId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
}

export class DataSourcePublishingService {
  private db: Database.Database;
  private dataSourceRepo: DataSourceRepository;
  private mvtPublisher: MVTOnDemandPublisher;
  private wmsPublisher: WMSPublisher;
  private workspaceBase: string;

  constructor(db: Database.Database, workspaceBase: string, mvtPublisher?: MVTOnDemandPublisher) {
    this.db = db;
    this.dataSourceRepo = new DataSourceRepository(db);
    // Use provided publisher or get singleton instance
    this.mvtPublisher = mvtPublisher || MVTOnDemandPublisher.getInstance(workspaceBase, 10000);
    this.wmsPublisher = new WMSPublisher(workspaceBase, db);
    this.workspaceBase = workspaceBase;
  }

  /**
   * Publish a data source as appropriate service (MVT for vector, WMS for raster)
   * @param dataSourceId - The ID of the data source to publish
   * @returns Published service information
   */
  async publishDataSource(dataSourceId: string): Promise<PublishedServiceInfo> {
    const dataSource = this.dataSourceRepo.getById(dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${dataSourceId}`);
    }

    console.log(`[DataSourcePublishingService] Publishing data source: ${dataSourceId}, type: ${dataSource.type}`);

    // Determine service type based on data source type
    if (dataSource.type === 'tif') {
      return await this.publishAsWMS(dataSource);
    } else {
      // geojson, shapefile, csv, postgis -> MVT
      return await this.publishAsMVT(dataSource);
    }
  }

  /**
   * Check if a data source is already published
   * @param dataSourceId - The data source ID
   * @returns true if already published
   */
  async isPublished(dataSourceId: string): Promise<boolean> {
    try {
      // Check MVT tilesets - dataSourceId is used as tilesetId
      const mvtTilesets = this.mvtPublisher.listTilesets();
      const isMVTPublished = mvtTilesets.some((ts: { tilesetId: string; metadata: MVTPublishMetadata }) => 
        ts.tilesetId === dataSourceId
      );

      if (isMVTPublished) {
        return true;
      }

      // Check WMS services (would need to query database or check manager)
      // For now, we'll assume if it's not MVT published, it might be WMS
      // TODO: Implement proper WMS service tracking
      return false;
    } catch (error) {
      console.error('[DataSourcePublishingService] Check publication status failed:', error);
      return false;
    }
  }

  /**
   * Get the service URL for a data source
   * If not published, auto-publish first
   * @param dataSourceId - The data source ID
   * @returns Service URL and type
   */
  async getServiceUrl(dataSourceId: string): Promise<{
    url: string;
    type: 'mvt' | 'wms';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>;
  }> {
    // Check if already published
    const isPublished = await this.isPublished(dataSourceId);
    console.log(`[DataSourcePublishingService] Checking publication status for data source: ${dataSourceId}, isPublished: ${isPublished}`);
    if (!isPublished) {
      console.log(`[DataSourcePublishingService] Data source ${dataSourceId} not published, publishing now...`);
      await this.publishDataSource(dataSourceId);
    }

    const dataSource = this.dataSourceRepo.getById(dataSourceId);
    if (!dataSource) {
      throw new Error(`Data source not found: ${dataSourceId}`);
    }

    // Return appropriate URL based on type
    if (dataSource.type === 'tif') {
      return {
        url: `/api/services/wms/${dataSourceId}`,
        type: 'wms'
      };
    } else {
      return {
        url: `/api/mvt-dynamic/${dataSourceId}/{z}/{x}/{y}.pbf`,
        type: 'mvt'
      };
    }
  }

  /**
   * Publish data source as MVT service
   */
  private async publishAsMVT(dataSource: DataSourceRecord): Promise<PublishedServiceInfo> {
    let source: MVTSource;

    if (dataSource.type === 'postgis') {
      // PostGIS source
      const connection = dataSource.metadata.connection;
      if (!connection) {
        throw new Error(`PostGIS data source missing connection info: ${dataSource.id}`);
      }

      // Debug: Log metadata to see what's available
      // console.log('[DataSourcePublishingService] PostGIS metadata:', JSON.stringify(dataSource.metadata, null, 2));

      // Extract tableName - check multiple possible locations
      const tableName = dataSource.metadata.tableName || 
                       (dataSource.metadata.result && typeof dataSource.metadata.result === 'object' ? dataSource.metadata.result.table : undefined);
      const sqlQuery = dataSource.metadata.sqlQuery;

      if (!tableName && !sqlQuery) {
        throw new Error(
          `PostGIS data source must have either tableName or sqlQuery in metadata. ` +
          `Data source ID: ${dataSource.id}, Metadata keys: ${Object.keys(dataSource.metadata).join(', ')}`
        );
      }

      console.log(`[DataSourcePublishingService] Using tableName: ${tableName}, sqlQuery: ${sqlQuery ? 'present' : 'not present'}`);

      source = {
        type: 'postgis',
        connection: {
          host: connection.host,
          port: connection.port || 5432,
          database: connection.database,
          user: connection.user,
          password: connection.password || '', // Should be decrypted in real implementation
          schema: connection.schema || dataSource.metadata.schema || 'public'  // Include schema
        },
        tableName: tableName,
        sqlQuery: sqlQuery,
        geometryColumn: dataSource.metadata.geometryColumn || 'geom'
      };
    } else if (dataSource.type === 'shapefile') {
      // Shapefile needs to be converted to GeoJSON first
      const shpPath = dataSource.reference;
      
      if (!shpPath || !fs.existsSync(shpPath)) {
        throw new Error(`Shapefile not found: ${dataSource.id}, path: ${shpPath}`);
      }

      console.log(`[DataSourcePublishingService] Converting shapefile to GeoJSON: ${shpPath}`);
      
      // Use ShapefileAccessor to convert to GeoJSON
      const accessor = new ShapefileAccessor(this.workspaceBase);
      type ShapefileAccessorWithProtected = ShapefileAccessor & {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        loadGeoJSON: (path: string) => Promise<any>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        saveGeoJSON: (data: any, name: string) => Promise<string>;
      };
      const geojson = await (accessor as ShapefileAccessorWithProtected).loadGeoJSON(shpPath);
      
      // Save GeoJSON to a temporary location for MVT publishing
      const geojsonPath = await (accessor as ShapefileAccessorWithProtected).saveGeoJSON(geojson, `mvt_${dataSource.id}`);
      
      console.log(`[DataSourcePublishingService] Shapefile converted to GeoJSON: ${geojsonPath}`);
      
      source = {
        type: 'geojson-file',
        filePath: geojsonPath
      };
    } else {
      // File-based sources (geojson, csv)
      const filePath = dataSource.reference;
      
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`File not found for data source: ${dataSource.id}, path: ${filePath}`);
      }

      source = {
        type: 'geojson-file',
        filePath: filePath
      };
    }

    // Publish with default options, using data source ID as tileset ID
    const options: MVTTileOptions = {
      minZoom: 0,
      maxZoom: 22,
      extent: 4096,
      tolerance: 3,
      buffer: 64,
      layerName: 'default',  // Use 'default' as layer name to match frontend expectation
      tilesetId: dataSource.id  // Use data source ID as tileset ID
    };

    const result = await this.mvtPublisher.publish(source, options, dataSource.id);

    if (!result.success) {
      throw new Error(`Failed to publish MVT: ${result.error}`);
    }

    console.log(`[DataSourcePublishingService] Published MVT tileset: ${result.tilesetId}`);

    return {
      dataSourceId: dataSource.id,
      serviceType: 'mvt',
      serviceUrl: `/api/mvt-dynamic/${dataSource.id}/{z}/{x}/{y}.pbf`,
      tilesetId: result.tilesetId,
      metadata: result.metadata
    };
  }

  /**
   * Publish data source as WMS service
   */
  private async publishAsWMS(dataSource: DataSourceRecord): Promise<PublishedServiceInfo> {
    const filePath = dataSource.reference;
    
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`GeoTIFF file not found: ${dataSource.id}, path: ${filePath}`);
    }

    // Create a mock NativeData object for WMS publisher
    const nativeData = {
      id: dataSource.id,
      type: 'tif' as const,
      reference: filePath,
      metadata: {
        ...(dataSource.metadata || {}),
        result: filePath, // Add required StandardizedOutput field
        description: `WMS service for ${dataSource.name}`
      },
      createdAt: dataSource.createdAt
    };

    // Generate WMS service
    const serviceId = await this.wmsPublisher.generateService(nativeData, {
      name: dataSource.name,
      title: dataSource.name,
      srs: 'EPSG:4326'
    });

    console.log(`[DataSourcePublishingService] Published WMS service: ${serviceId}`);

    return {
      dataSourceId: dataSource.id,
      serviceType: 'wms',
      serviceUrl: `/api/services/wms/${serviceId}`,
      serviceId: serviceId,
      metadata: {
        serviceType: 'wms',
        filePath: filePath
      }
    };
  }
}
