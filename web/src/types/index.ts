/**
 * Core type definitions for GeoAI-UP Frontend
 */

// ============================================================================
// Map Types
// ============================================================================

export enum LayerType {
  GeoJSON = 'geojson',
  MVT = 'mvt',
  WMS = 'wms',
  Heatmap = 'heatmap',
  Image = 'image'
}

export type BasemapType = 
  | 'cartoDark'
  | 'cartoLight'
  | 'esriStreet'
  | 'esriSatellite'
  | 'osmStandard'
  | 'stamenTerrain'

export interface BasemapConfig {
  type: 'raster'
  tiles: string[]
  tileSize: number
  attribution: string
}

export interface MapLayer {
  id: string
  name?: string  // Display name for the layer
  type: LayerType
  url: string
  visible: boolean
  opacity?: number
  style?: LayerStyle
  sourceLayer?: string
  minZoom?: number
  maxZoom?: number
  dataSourceId?: string  // Link to data source for metadata
  metadata?: Record<string, any>  // Additional metadata
  createdAt: string
}

export interface LayerStyle {
  fillColor?: string
  fillOpacity?: number
  strokeColor?: string
  strokeWidth?: number
}

// ============================================================================
// Chat Types
// ============================================================================

export enum VisualizationServiceType {
  GeoJSON = 'geojson',
  MVT = 'mvt',
  WMS = 'wms',
  Heatmap = 'heatmap',
  Image = 'image',
  Report = 'report'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  services?: VisualizationService[]
}

export interface VisualizationService {
  id: string
  type: VisualizationServiceType
  url: string
  goalId?: string
  stepId?: string
  metadata?: Record<string, any>
}

export interface SSEEvent {
  type: 'token' | 'step_start' | 'step_complete' | 'partial_result' | 'complete' | 'error'
  content?: string
  service?: VisualizationService
  services?: VisualizationService[]
  message?: string
  conversationId?: string
}

// ============================================================================
// Data Source Types
// ============================================================================

export interface DataSource {
  id: string
  name: string
  type: 'shapefile' | 'geojson' | 'postgis' | 'geotiff' | 'csv'
  reference: string
  metadata: DataMetadata
  createdAt: string
  updatedAt?: string
}

export interface DataMetadata {
  crs?: string
  srid?: number
  geometryType?: string
  featureCount?: number
  bbox?: [number, number, number, number]
  fields?: FieldInfo[]
  fileSize?: number
  [key: string]: any
}

/**
 * Field information - unified format for all vector data sources
 */
export interface FieldInfo {
  /** Field name */
  name: string
  
  /** Field type (unified type system) */
  type: string
}

// ============================================================================
// Tool & Plugin Types
// ============================================================================

export interface Tool {
  id: string
  name: string
  description: string
  category: 'analysis' | 'visualization' | 'data_import' | 'report' | 'utility'
  version: string
  isBuiltin: boolean
  inputSchema: ParameterSchema[]
  outputSchema: ResultSchema
  capabilities: string[]
}

export interface ParameterSchema {
  name: string
  type: 'string' | 'number' | 'boolean' | 'data_reference' | 'array' | 'object'
  required: boolean
  description?: string
  defaultValue?: any
  validation?: ParameterValidation
}

export interface ParameterValidation {
  min?: number
  max?: number
  enum?: string[]
  pattern?: string
}

export interface ResultSchema {
  type: string
  description: string
}

export interface Plugin {
  id: string
  name: string
  version: string
  description: string
  category: string
  enabled: boolean
  isBuiltin: boolean
  installedAt: string
}

// ============================================================================
// Prompt Template Types
// ============================================================================

export interface PromptTemplate {
  id: string
  name: string
  language: string
  content: string
  description?: string
  version: string
  createdAt: string
  updatedAt: string
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// ============================================================================
// Utility Types
// ============================================================================

export type ThemeType = 'light' | 'dark' | 'auto'
export type LanguageType = 'en-US' | 'zh-CN'
