/**
 * MVT Publisher Shared Types
 * 
 * Common interfaces and types used across MVT publisher implementations.
 * This file consolidates duplicate interface definitions to improve maintainability.
 */

/**
 * Represents a single MVT tile request (unified)
 */
export interface MVTTileRequest {
  datasourceId: string;
  z: number;
  x: number;
  y: number;
  filter?: Record<string, any>;
  // PostGIS-specific fields (optional)
  schemaName?: string;
  tableName?: string;
  geometryColumn?: string;
  srid?: number;
}

/**
 * Callback function that generates MVT tiles on demand
 */
export type MVTTileCallback = (
  request: MVTTileRequest
) => Promise<Buffer | null>;

/**
 * Configuration options for MVT tile generation (unified)
 */
export interface MVTPublisherOptions {
  /** Maximum zoom level (default: 22) */
  maxZoom?: number;
  /** Simplification tolerance (default: 3 for GeoJSON, true for PostGIS) */
  tolerance?: number;
  /** Tile extent in pixels (default: 4096) */
  extent?: number;
  /** Tile buffer size (default: 64) */
  buffer?: number;
  /** Custom cache key (default: datasourceId) */
  indexId?: string;
  /** Additional WHERE clause for filtering (PostGIS only) */
  whereClause?: string;
}
