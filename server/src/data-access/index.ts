/**
 * Data Access Layer - Type Definitions and Utilities
 * 
 * NOTE: Accessor implementations have been migrated to spatial-operators/backends.
 * This module now only provides shared types and utility classes.
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

// Repositories
export { DataSourceRepository } from './repositories/DataSourceRepository';

// Utilities
export { DataSourceDetector } from './utils/DataSourceDetector';
export { PostGISPoolManager } from './utils/PostGISPoolManager';
export { PostGISConnectionParser } from './utils/PostGISConnectionParser';
export { parseConnectionConfig, convertDistanceUnit } from './utils/PostGISUtils';
