/**
 * Backends Module - Unified exports for all data backends
 */

// Core interface
export type { DataBackend } from './DataBackend';
export { BaseBackend } from './DataBackend';

// Backend implementations
export { VectorBackend } from './vector';
export { RasterBackend } from './raster';
export { PostGISBackend } from './postgis';
