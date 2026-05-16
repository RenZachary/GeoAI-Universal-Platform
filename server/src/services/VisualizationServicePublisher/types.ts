export type ServiceType = 'mvt' | 'wms' | 'geojson' | 'report';

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
  getExpiredServices(): VisualizationServiceInfo[];
  clear(): void;
}
