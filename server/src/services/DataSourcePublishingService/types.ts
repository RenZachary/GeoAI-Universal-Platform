export interface PublishedServiceInfo {
  dataSourceId: string;
  serviceType: 'mvt' | 'wms';
  serviceUrl: string;
  tilesetId?: string;
  serviceId?: string;
  metadata: Record<string, any>;
}

export interface ServiceUrlResult {
  url: string;
  type: 'mvt' | 'wms';
  metadata?: Record<string, any>;
}
