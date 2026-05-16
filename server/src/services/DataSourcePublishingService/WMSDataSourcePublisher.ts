import type { DataSourceRecord } from '../../data-access/repositories';
import type { VisualizationServicePublisher } from '../VisualizationServicePublisher';
import type { PublishingRepository } from './Repository';
import { DEFAULT_WMS_SRS } from './constant';
import fs from 'fs';

export class WMSDataSourcePublisher {
  private publisher: VisualizationServicePublisher;
  private repository: PublishingRepository;

  constructor(
    publisher: VisualizationServicePublisher,
    repository: PublishingRepository
  ) {
    this.publisher = publisher;
    this.repository = repository;
  }

  async publish(dataSource: DataSourceRecord): Promise<{
    serviceId: string;
    serviceUrl: string;
    metadata: Record<string, any>;
  }> {
    const filePath = dataSource.reference;
    
    if (!filePath) {
      throw new Error(`GeoTIFF file path not specified: ${dataSource.id}`);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`GeoTIFF file not found: ${dataSource.id}, path: ${filePath}`);
    }

    const nativeData = {
      id: dataSource.id,
      type: 'tif' as const,
      reference: filePath,
      metadata: {
        ...(dataSource.metadata || {}),
        result: filePath,
        description: `WMS service for ${dataSource.name}`
      },
      createdAt: dataSource.createdAt
    };

    const publishResult = await this.publisher.publishWMS(nativeData, {
      name: dataSource.name,
      title: dataSource.name,
      srs: DEFAULT_WMS_SRS
    });
    
    if (!publishResult.success || !publishResult.serviceId) {
      throw new Error(`Failed to publish WMS: ${publishResult.error}`);
    }
    
    const serviceId = publishResult.serviceId;

    console.log(`[WMSDataSourcePublisher] Published WMS service: ${serviceId}`);

    try {
      this.repository.updateMetadataWithWMSId(dataSource.id, serviceId);
      console.log(`[WMSDataSourcePublisher] Saved WMS service ID to data source metadata`);
    } catch (error) {
      console.error(`[WMSDataSourcePublisher] Failed to save WMS service ID:`, error);
    }

    return {
      serviceId: serviceId,
      serviceUrl: `/api/services/wms/${serviceId}`,
      metadata: {
        serviceType: 'wms',
        filePath: filePath,
        wmsServiceId: serviceId,
        bbox: dataSource.metadata?.bbox,
        name: dataSource.name
      }
    };
  }
}
