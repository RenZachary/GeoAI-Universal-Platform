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
} from './interfaces';

// Factory
export { DataAccessorFactory } from './factories/DataAccessorFactory';

// Accessors (for direct instantiation if needed)
export { GeoJSONAccessor } from './accessors/GeoJSONAccessor';
export { ShapefileAccessor } from './accessors/ShapefileAccessor';
export { PostGISAccessor, type PostGISConnectionConfig } from './accessors/PostGISAccessor';
export { GeoTIFFAccessor } from './accessors/GeoTIFFAccessor';

// Utilities
export { DataSourceDetector } from './utils/DataSourceDetector';
