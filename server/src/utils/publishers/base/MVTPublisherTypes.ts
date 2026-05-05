/**
 * MVT Publisher Shared Types
 * 
 * Common type definitions used by both MVTStrategyPublisher and MVTOnDemandPublisher
 */

// ============================================================================
// MVT Tile Options
// ============================================================================

export interface MVTTileOptions {
  minZoom?: number;
  maxZoom?: number;
  extent?: number;
  tolerance?: number;
  buffer?: number;
  layerName?: string;
  tilesetId?: string;  // Optional custom tileset ID (used by MVTOnDemandPublisher)
}

// ============================================================================
// PostGIS Types
// ============================================================================

export interface PostGISConnectionInfo {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema?: string;  // Default: 'public'
}

export interface PostGISDataSource {
  type: 'postgis';
  connection: PostGISConnectionInfo;
  tableName?: string;      // Table name (mutually exclusive with sqlQuery)
  sqlQuery?: string;       // Custom SQL query (mutually exclusive with tableName)
  geometryColumn?: string; // Default: 'geom'
}

// ============================================================================
// GeoJSON Source Types (for MVTOnDemandPublisher)
// ============================================================================

export interface GeoJSONFileSource {
  type: 'geojson-file';
  filePath: string;
}

export interface GeoJSONInMemorySource {
  type: 'geojson-memory';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  featureCollection: any;  // GeoJSON FeatureCollection
}

export type MVTSource = PostGISDataSource | GeoJSONFileSource | GeoJSONInMemorySource;

// ============================================================================
// Publish Result Types
// ============================================================================

export interface MVTPublishResult {
  success: boolean;
  tilesetId: string;
  serviceUrl: string;       // URL template: /api/mvt/{tilesetId}/{z}/{x}/{y}.pbf
  metadata: MVTPublishMetadata;
  error?: string;
}

export interface MVTPublishMetadata {
  sourceType?: 'postgis' | 'geojson-file' | 'geojson-memory';
  minZoom: number;
  maxZoom: number;
  extent: number;
  generatedAt: string;
  featureCount?: number;     // For GeoJSON
  tableName?: string;        // For PostGIS
  sqlQuery?: string;         // For PostGIS
  cacheEnabled?: boolean;
  strategy?: string;         // For MVTStrategyPublisher
  sourceFile?: string;       // For MVTStrategyPublisher
  [key: string]: any;        // Allow additional metadata fields
}
