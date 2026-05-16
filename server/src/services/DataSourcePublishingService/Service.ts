import type Database from 'better-sqlite3';
import { DataSourceRepository, type DataSourceRecord } from '../../data-access/repositories';
import { VisualizationServicePublisher } from '../VisualizationServicePublisher';
import { PublishingRepository } from './Repository';
import { MVTDataSourcePublisher } from './MVTDataSourcePublisher';
import { WMSDataSourcePublisher } from './WMSDataSourcePublisher';
import type { PublishedServiceInfo, ServiceUrlResult } from './types';
import path from 'path';
import fs from 'fs';

export class DataSourcePublishingService {
  private repository: PublishingRepository;
  private mvtDataSourcePublisher: MVTDataSourcePublisher;
  private wmsDataSourcePublisher: WMSDataSourcePublisher;
  private workspaceBase: string;
  private dataSourceRepo: DataSourceRepository;

  constructor(db: Database.Database, workspaceBase: string) {
    this.workspaceBase = workspaceBase;
    this.dataSourceRepo = new DataSourceRepository(db);
    
    const publisher = VisualizationServicePublisher.getInstance(workspaceBase, db);
    this.repository = new PublishingRepository(db, this.dataSourceRepo);
    this.mvtDataSourcePublisher = new MVTDataSourcePublisher(publisher);
    this.wmsDataSourcePublisher = new WMSDataSourcePublisher(publisher, this.repository);
  }

  async publishDataSource(dataSourceId: string): Promise<PublishedServiceInfo> {
    const dataSource = this.repository.getDataSourceById(dataSourceId);

    console.log(`[DataSourcePublishingService] Publishing data source: ${dataSourceId}, type: ${dataSource.type}`);

    if (dataSource.type === 'tif') {
      return await this.publishAsWMS(dataSource);
    } else {
      return await this.publishAsMVT(dataSource);
    }
  }

  async isPublished(dataSourceId: string): Promise<boolean> {
    try {
      const dataSource = this.repository.getDataSourceById(dataSourceId);

      if (dataSource.type !== 'tif') {
        return this.checkMVTPublication(dataSourceId);
      }

      return this.checkWMSPublication(dataSource);
    } catch (error) {
      console.error('[DataSourcePublishingService] Check publication status failed:', error);
      return false;
    }
  }

  async getServiceUrl(dataSourceId: string): Promise<ServiceUrlResult> {
    const dataSource = this.repository.getDataSourceById(dataSourceId);

    const isPublished = await this.isPublished(dataSourceId);
    console.log(`[DataSourcePublishingService] Checking publication status for data source: ${dataSourceId}, isPublished: ${isPublished}`);
    
    let publishedInfo: PublishedServiceInfo;
    
    if (!isPublished) {
      console.log(`[DataSourcePublishingService] Data source ${dataSourceId} not published, publishing now...`);
      publishedInfo = await this.publishDataSource(dataSourceId);
    } else {
      publishedInfo = this.buildPublishedInfo(dataSource);
    }

    return {
      url: publishedInfo.serviceUrl,
      type: publishedInfo.serviceType,
      metadata: publishedInfo.metadata
    };
  }

  private async publishAsMVT(dataSource: DataSourceRecord): Promise<PublishedServiceInfo> {
    const result = await this.mvtDataSourcePublisher.publish(dataSource);

    console.log(`[DataSourcePublishingService] Published MVT tileset: ${result.serviceId}`);

    return {
      dataSourceId: dataSource.id,
      serviceType: 'mvt',
      serviceUrl: result.serviceUrl,
      tilesetId: result.serviceId,
      metadata: result.metadata
    };
  }

  private async publishAsWMS(dataSource: DataSourceRecord): Promise<PublishedServiceInfo> {
    const result = await this.wmsDataSourcePublisher.publish(dataSource);

    console.log(`[DataSourcePublishingService] Published WMS service: ${result.serviceId}`);

    return {
      dataSourceId: dataSource.id,
      serviceType: 'wms',
      serviceUrl: result.serviceUrl,
      serviceId: result.serviceId,
      metadata: result.metadata
    };
  }

  private checkMVTPublication(dataSourceId: string): boolean {
    const mvtOutputDir = path.join(this.workspaceBase, 'results', 'mvt');
    const metadataPath = path.join(mvtOutputDir, dataSourceId, 'metadata.json');
    const exists = fs.existsSync(metadataPath);
    
    if (!exists) {
      console.log(`[DataSourcePublishingService] Service record exists but tileset directory missing for: ${dataSourceId}`);
      return false;
    }
    
    return true;
  }

  private checkWMSPublication(dataSource: DataSourceRecord): boolean {
    const wmsServiceId = dataSource.metadata?.wmsServiceId;
    if (!wmsServiceId) {
      return false;
    }

    const wmsOutputDir = path.join(this.workspaceBase, 'results', 'wms');
    const metadataPath = path.join(wmsOutputDir, wmsServiceId, 'metadata.json');
    const exists = fs.existsSync(metadataPath);
    
    if (!exists) {
      console.log(`[DataSourcePublishingService] WMS service record exists but metadata file missing for: ${wmsServiceId}`);
      return false;
    }
    
    return true;
  }

  private buildPublishedInfo(dataSource: DataSourceRecord): PublishedServiceInfo {
    if (dataSource.type === 'tif') {
      const wmsServiceId = dataSource.metadata?.wmsServiceId;
      if (!wmsServiceId) {
        throw new Error('WMS service ID not found in metadata');
      }

      const bbox = dataSource.metadata?.bbox;
      return {
        dataSourceId: dataSource.id,
        serviceType: 'wms',
        serviceUrl: `/api/services/wms/${wmsServiceId}`,
        serviceId: wmsServiceId,
        metadata: {
          serviceType: 'wms',
          wmsServiceId,
          bbox: bbox,
          name: dataSource.name
        }
      };
    } else {
      return {
        dataSourceId: dataSource.id,
        serviceType: 'mvt',
        serviceUrl: `/api/services/mvt/${dataSource.id}/{z}/{x}/{y}.pbf`,
        tilesetId: dataSource.id,
        metadata: {}
      };
    }
  }
}
