/**
 * Data Access Layer - Main exports
 * Provides unified interface for all data source operations
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

// Factory
export { DataAccessorFactory } from './factories/DataAccessorFactory';

// Accessors (for direct instantiation if needed)
export { ShapefileAccessor } from './accessors/ShapefileAccessor';
export { GeoTIFFAccessor } from './accessors/GeoTIFFAccessor';

// Utilities
export { DataSourceDetector } from './utils/DataSourceDetector';
export { PostGISPoolManager } from './utils/PostGISPoolManager';
export { PostGISConnectionParser } from './utils/PostGISConnectionParser';
export { parseConnectionConfig, convertDistanceUnit } from './utils/PostGISUtils';
