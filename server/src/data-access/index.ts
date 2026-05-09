/**
 * Data Access Layer - Complete Implementation
 * 
 * Unified data access architecture with Backend pattern.
 */

// Core interfaces (type-only exports)
export type {
  DataAccessor,
  FileAccessor,
  DatabaseAccessor,
  PostGISAccessor as PostGISAccessorInterface,
  WebServiceAccessor,
  TableSchema,
  ColumnInfo,
  IndexInfo,
  FilterCondition,
  BufferOptions,
  OverlayOptions,
} from './interfaces';

// Backend implementations (NEW v2.0)
export type { DataBackend } from './backends/DataBackend';
export { VectorBackend } from './backends/vector';
export { RasterBackend } from './backends/raster';
export { PostGISBackend } from './backends/postgis';

// DataAccessFacade (NEW v2.0)
export { DataAccessFacade, type VisualizationOptions } from './facade/DataAccessFacade';

// Repositories
export { DataSourceRepository } from './repositories/DataSourceRepository';
export type { DataSourceRecord } from './repositories/DataSourceRepository';

// Utilities
export { DataSourceDetector } from './utils/DataSourceDetector';
export { PostGISPoolManager } from './utils/PostGISPoolManager';
export { PostGISConnectionParser } from './utils/PostGISConnectionParser';
export { parseConnectionConfig, convertDistanceUnit } from './utils/PostGISUtils';
export { tryMultipleEncodings, validateStringEncoding, SUPPORTED_ENCODINGS } from './utils/ShapefileEncodingUtils';
export type { FeatureWithProperties, SupportedEncoding } from './utils/ShapefileEncodingUtils';
