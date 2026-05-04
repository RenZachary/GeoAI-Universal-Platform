/**
 * Core type definitions for GeoAI-UP platform
 * These types are shared across all layers
 */

// ============================================================================
// NativeData Principle - Keep original data formats
// ============================================================================

export interface NativeData {
  /** Unique identifier for this data reference */
  id: string;
  
  /** Data source type */
  type: DataSourceType;
  
  /** Reference to actual data (file path, table name, etc.) */
  reference: string;
  
  /** Metadata about the data */
  metadata: DataMetadata;
  
  /** Creation timestamp */
  createdAt: Date;
}

export type DataSourceType = 
  | 'shapefile'
  | 'geojson'
  | 'postgis'
  | 'tif'
  | 'mvt'
  | 'wms';

export interface DataMetadata {
  /** Coordinate reference system (e.g., EPSG:4326) */
  crs?: string;
  
  /** PostGIS SRID if applicable */
  srid?: number;
  
  /** Bounding box [minX, minY, maxX, maxY] */
  bbox?: [number, number, number, number];
  
  /** Feature count (for vector data) */
  featureCount?: number;
  
  /** Field/column names */
  fields?: string[];
  
  /** File size in bytes (for file-based data) */
  fileSize?: number;
  
  /** Additional custom metadata */
  [key: string]: any;
}

// ============================================================================
// Plugin System Types
// ============================================================================

export interface Plugin {
  /** Unique plugin identifier */
  id: string;
  
  /** Plugin name */
  name: string;
  
  /** Plugin version */
  version: string;
  
  /** Plugin description */
  description: string;
  
  /** Plugin category */
  category: PluginCategory;
  
  /** Input parameters schema (array of parameter definitions) */
  inputSchema: ParameterSchema[];
  
  /** Output result schema */
  outputSchema: ResultSchema;
  
  /** Plugin capabilities/requirements */
  capabilities: string[];
  
  /** Whether this is a built-in plugin */
  isBuiltin: boolean;
  
  /** Path to plugin implementation */
  implementationPath?: string;
  
  /** Installation timestamp */
  installedAt: Date;
}

export type PluginCategory = 
  | 'analysis'      // Spatial analysis (buffer, overlay, etc.)
  | 'visualization' // Visualization generation
  | 'data_import'   // Data import/export
  | 'report'        // Report generation
  | 'utility';      // Utility functions

export interface ParameterSchema {
  /** Parameter name */
  name: string;
  
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'data_reference';
  
  /** Whether parameter is required */
  required: boolean;
  
  /** Default value */
  defaultValue?: any;
  
  /** Description */
  description: string;
  
  /** Validation rules */
  validation?: ValidationRule;
}

export interface ValidationRule {
  min?: number;
  max?: number;
  pattern?: string;
  enum?: any[];
}

export interface ResultSchema {
  /** Result type */
  type: 'native_data' | 'statistics' | 'text' | 'image';
  
  /** Result description */
  description: string;
  
  /** Expected structure */
  structure?: any;
}

// ============================================================================
// Analysis & Execution Types
// ============================================================================

export interface AnalysisGoal {
  /** Goal identifier */
  id: string;
  
  /** Goal description */
  description: string;
  
  /** Goal type */
  type: 'visualization' | 'analysis' | 'report' | 'query';
  
  /** Associated data sources */
  dataSources?: string[];
  
  /** Parameters for this goal */
  parameters?: Record<string, any>;
}

export interface ExecutionPlan {
  /** Plan identifier */
  id: string;
  
  /** Goal this plan addresses */
  goalId: string;
  
  /** Execution steps */
  steps: ExecutionStep[];
  
  /** Execution mode */
  executionMode: 'sequential' | 'parallel';
  
  /** Created timestamp */
  createdAt: Date;
}

export interface ExecutionStep {
  /** Step identifier */
  id: string;
  
  /** Step order */
  order: number;
  
  /** Plugin to execute */
  pluginName: string;
  
  /** Parameters for plugin */
  parameters: Record<string, any>;
  
  /** Expected output type */
  outputType: string;
  
  /** Dependencies (step IDs that must complete first) */
  dependencies?: string[];
}

export interface AnalysisResult {
  /** Result identifier */
  id: string;
  
  /** Goal this result addresses */
  goalId: string;
  
  /** Result status */
  status: 'success' | 'failed';
  
  /** Result data (NativeData or other) */
  data?: any;
  
  /** Error message if failed */
  error?: string;
  
  /** Completion timestamp */
  completedAt: Date;
}

// ============================================================================
// Conversation & Context Types
// ============================================================================

export interface ConversationContext {
  /** Conversation identifier */
  conversationId: string;
  
  /** Message history */
  messages: Message[];
  
  /** Currently active data sources */
  currentDataSources: string[];
  
  /** Active plugins */
  activePlugins: string[];
  
  /** Last analysis results */
  lastAnalysisResults: AnalysisResult[];
  
  /** Analysis parameter memory for multi-turn dialogue */
  analysisParameters?: {
    distance?: number;
    unit?: DistanceUnit;
    fields?: string[];
    [key: string]: any;
  };
  
  /** Creation timestamp */
  createdAt: Date;
  
  /** Last update timestamp */
  updatedAt: Date;
}

export interface Message {
  /** Message identifier */
  id: string;
  
  /** Message role */
  role: 'user' | 'assistant' | 'system';
  
  /** Message content */
  content: string;
  
  /** Timestamp */
  timestamp: Date;
}

export type DistanceUnit = 'meters' | 'kilometers' | 'feet' | 'miles';

// ============================================================================
// Service & Visualization Types
// ============================================================================

export interface VisualizationService {
  /** Service identifier */
  id: string;
  
  /** Service type */
  type: 'mvt' | 'wms' | 'heatmap';
  
  /** Service URL endpoint */
  url: string;
  
  /** Associated data source */
  dataSourceId: string;
  
  /** Service metadata */
  metadata: ServiceMetadata;
  
  /** Time-to-live in milliseconds */
  ttl: number;
  
  /** Expiration timestamp */
  expiresAt: number;
  
  /** Whether service is active */
  isActive: boolean;
  
  /** Creation timestamp */
  createdAt: Date;
}

export interface ServiceMetadata {
  /** Tile layer info (for MVT) */
  tileInfo?: {
    minZoom: number;
    maxZoom: number;
    format: 'pbf' | 'png' | 'jpg';
  };
  
  /** Image size limits (for WMS) */
  imageSize?: {
    maxWidth: number;
    maxHeight: number;
  };
  
  /** Style information */
  style?: any;
  
  /** Additional metadata */
  [key: string]: any;
}

// ============================================================================
// Storage & Workspace Types
// ============================================================================

export interface WorkspaceInfo {
  /** Workspace base directory */
  baseDir: string;
  
  /** Workspace directories */
  directories: WorkspaceDirectories;
  
  /** Storage usage in bytes */
  storageUsage: number;
  
  /** Last updated */
  updatedAt: Date;
}

export interface WorkspaceDirectories {
  dataLocal: string;
  dataPostgis: string;
  llmConfig: string;
  llmPromptsEnUS: string;
  llmPromptsZhCN: string;
  pluginsBuiltin: string;
  pluginsCustom: string;
  database: string;
  databaseBackups: string;
  temp: string;
  resultsGeojson: string;
  resultsShapefile: string;
  resultsMvt: string;
  resultsWms: string;
  resultsReports: string;
}

// ============================================================================
// Database Entity Types
// ============================================================================

export interface DataSourceEntity {
  id: string;
  name: string;
  type: DataSourceType;
  reference: string;
  metadata: string; // JSON string
  createdAt: string;
  updatedAt: string;
}

export interface PluginEntity {
  id: string;
  name: string;
  version: string;
  description: string;
  category: PluginCategory;
  inputSchema: string; // JSON string
  outputSchema: string; // JSON string
  capabilities: string; // JSON array
  isBuiltin: boolean;
  implementationPath: string | null;
  installedAt: string;
}

export interface ConversationEntity {
  id: string;
  userId: string;
  context: string; // JSON string
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisHistoryEntity {
  id: string;
  conversationId: string;
  goalId: string;
  executionPlan: string; // JSON string
  results: string; // JSON string
  status: 'completed' | 'failed' | 'partial';
  createdAt: string;
  completedAt: string | null;
}
