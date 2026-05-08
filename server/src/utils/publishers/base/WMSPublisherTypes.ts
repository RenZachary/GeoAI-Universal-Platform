/**
 * WMS Publisher Types - Common type definitions for WMS publishing
 */

import type { DataSourceType } from '../../../core/index';

// ============================================================================
// WMS Layer Configuration
// ============================================================================

export interface WMSLayerOptions {
  name?: string;
  title?: string;
  abstract?: string;
  srs?: string;  // Spatial Reference System (e.g., 'EPSG:4326')
  bbox?: [number, number, number, number];  // [minX, minY, maxX, maxY]
  styles?: WMSStyle[];
}

export interface WMSStyle {
  name: string;
  title: string;
  legendUrl?: string;
  styleUrl?: string;  // SLD/SE style definition
}

// ============================================================================
// WMS GetMap Request Parameters
// ============================================================================

export interface WMSGetMapParams {
  layers: string[];
  styles: string[];
  srs: string;
  bbox: [number, number, number, number];
  width: number;
  height: number;
  format: 'image/png' | 'image/jpeg' | 'image/geotiff';
  transparent?: boolean;
  bgcolor?: string;
}

// ============================================================================
// WMS Service Metadata
// ============================================================================

export interface WMSServiceMetadata {
  id: string;
  serviceUrl: string;
  capabilities: string;
  layers: WMSLayerInfo[];
  supportedFormats: string[];
  supportedSRS: string[];
  generatedAt: string;
  dataSourceType: DataSourceType;
}

export interface WMSLayerInfo {
  name: string;
  title: string;
  abstract?: string;
  srs: string;
  bbox: [number, number, number, number];
  styles: WMSStyle[];
  // Image dimensions for pixel coordinate calculations
  width?: number;
  height?: number;
}

// ============================================================================
// WMS Publish Result
// ============================================================================

export interface WMSPublishResult {
  success: boolean;
  serviceId: string;
  serviceUrl: string;
  metadata?: WMSServiceMetadata;
  error?: string;
}
