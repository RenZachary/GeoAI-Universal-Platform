import type { DataSourceRecord } from '../../data-access/repositories';
import type { VisualizationServicePublisher } from '../VisualizationServicePublisher';
import type { MVTSource, MVTTileOptions } from '../../publishers/base/MVTPublisherTypes';
import { WorkspaceManagerInstance } from '../../storage';
import { PublishingValidator } from './Validator';
import { 
  DEFAULT_MVT_LAYER_NAME, 
  DEFAULT_MVT_MIN_ZOOM, 
  DEFAULT_MVT_MAX_ZOOM,
  SHAPEFILE_CONVERSION_SUBDIR 
} from './constant';
import fs from 'fs';
import path from 'path';
import { wrapError } from '../../core';

export class MVTDataSourcePublisher {
  private publisher: VisualizationServicePublisher;
  private validator: PublishingValidator;

  constructor(publisher: VisualizationServicePublisher) {
    this.publisher = publisher;
    this.validator = new PublishingValidator((publisher as any).dataSourceRepo);
  }

  async publish(dataSource: DataSourceRecord): Promise<{
    serviceId: string;
    serviceUrl: string;
    metadata: Record<string, any>;
  }> {
    let source: MVTSource;

    if (dataSource.type === 'postgis') {
      source = this.createPostGISSource(dataSource);
    } else if (dataSource.type === 'shapefile') {
      source = await this.convertShapefileToGeoJSON(dataSource);
    } else {
      source = this.createFileBasedSource(dataSource);
    }

    const options: MVTTileOptions = {
      minZoom: DEFAULT_MVT_MIN_ZOOM,
      maxZoom: DEFAULT_MVT_MAX_ZOOM,
      extent: 4096,
      tolerance: 3,
      buffer: 64,
      layerName: DEFAULT_MVT_LAYER_NAME,
      tilesetId: dataSource.id
    };

    const result = await this.publisher.publishMVT(source, options, dataSource.id);

    if (!result.success) {
      throw new Error(`Failed to publish MVT: ${result.error}`);
    }

    return {
      serviceId: result.serviceId!,
      serviceUrl: `/api/services/mvt/${dataSource.id}/{z}/{x}/{y}.pbf`,
      metadata: result.metadata || {}
    };
  }

  private createPostGISSource(dataSource: DataSourceRecord): MVTSource {
    this.validator.validatePostGISConnection(dataSource);

    const connection = dataSource.metadata.connection;
    const tableName = dataSource.metadata.tableName || 
                     (dataSource.metadata.result && typeof dataSource.metadata.result === 'object' ? dataSource.metadata.result.table : undefined);
    const sqlQuery = dataSource.metadata.sqlQuery;

    return {
      type: 'postgis',
      connection: {
        host: connection.host,
        port: connection.port || 5432,
        database: connection.database,
        user: connection.user,
        password: connection.password || '',
        schema: connection.schema || dataSource.metadata.schema || 'public'
      },
      tableName: tableName,
      sqlQuery: sqlQuery,
      geometryColumn: dataSource.metadata.geometryColumn || 'geom'
    };
  }

  private async convertShapefileToGeoJSON(dataSource: DataSourceRecord): Promise<MVTSource> {
    const shpPath = dataSource.reference;
    this.validator.validateFileExists(shpPath, dataSource.id, 'Shapefile');

    console.log(`[MVTDataSourcePublisher] Converting shapefile to GeoJSON: ${shpPath}`);
    
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const tempDir = WorkspaceManagerInstance.getDirectoryPath('TEMP');
    const conversionSubdir = path.join(tempDir, SHAPEFILE_CONVERSION_SUBDIR);
    
    if (!fs.existsSync(conversionSubdir)) {
      fs.mkdirSync(conversionSubdir, { recursive: true });
    }
    
    const baseName = path.basename(shpPath, '.shp');
    const geojsonPath = path.join(conversionSubdir, `${baseName}_${Date.now()}.geojson`);
    
    try {
      await execAsync(`ogr2ogr -f "GeoJSON" "${geojsonPath}" "${shpPath}"`);
      console.log(`[MVTDataSourcePublisher] Shapefile converted to GeoJSON: ${geojsonPath}`);
    } catch (error) {        
      const message = error instanceof Error ? error.message : 'Unknown error';
      wrapError(error, message);
    }
    
    return {
      type: 'geojson-file',
      filePath: geojsonPath
    };
  }

  private createFileBasedSource(dataSource: DataSourceRecord): MVTSource {
    const filePath = dataSource.reference;
    this.validator.validateFileExists(filePath, dataSource.id, 'File');

    return {
      type: 'geojson-file',
      filePath: filePath
    };
  }
}
