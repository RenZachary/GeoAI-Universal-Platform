/**
 * PostGIS MVT Publisher Service
 * 
 * Leverages PostGIS native MVT generation capabilities (ST_AsMVT + ST_AsMVTGeom)
 * to serve vector tiles directly from database queries.
 * 
 * Unlike GeoJSON publisher which uses geojson-vt for client-side tiling,
 * this implementation uses database-level tile generation for optimal performance.
 */

import { Pool } from 'pg';
import type { MVTTileRequest } from '../MVTPublisherTypes';

/**
 * Represents a single MVT tile request for PostGIS
 */
export interface PostGISMVTTileRequest {
  datasourceId: string;
  schemaName: string;
  tableName: string;
  geometryColumn: string;
  srid: number;
  z: number;
  x: number;
  y: number;
  filter?: Record<string, any>;
}

/**
 * Callback function that generates MVT tiles on demand from PostGIS
 */
export type PostGISMVTTileCallback = (
  request: PostGISMVTTileRequest
) => Promise<Buffer | null>;

/**
 * Configuration options for PostGIS MVT tile generation
 */
export interface PostGISMVTPublisherOptions {
  /** Maximum zoom level (default: 14) */
  maxZoom?: number;
  /** Tile extent in pixels (default: 4096) */
  extent?: number;
  /** Tile buffer size (default: 64) */
  buffer?: number;
  /** Simplification tolerance (default: true - let ST_AsMVT handle it) */
  simplify?: boolean;
  /** Additional WHERE clause for filtering */
  whereClause?: string;
}

/**
 * PostGIS MVT Publisher - Generates vector tiles using native PostGIS functions
 * 
 * Uses ST_AsMVT() and ST_AsMVTGeom() for efficient server-side tile generation.
 * No caching needed as PostGIS handles query optimization and connection pooling.
 */
export class PostGISMVTPublisher {
  constructor() {}

  /**
   * Create an MVT tile service callback for a PostGIS table (internal method)
   * 
   * @param pool - PostgreSQL connection pool
   * @param options - Tile generation configuration options
   * @param customSql - Optional custom SQL query (e.g., from buffer operations)
   * @returns A callback function that generates tiles on demand
   * 
   * @example
   * ```typescript
   * const publisher = new PostGISMVTPublisher();
   * const tileCallback = await publisher.createPostGISTileService(pool, {
   *   maxZoom: 14,
   *   extent: 4096,
   *   buffer: 64
   * });
   * 
   * // Use the callback in an Express route
   * app.get('/tiles/:schema/:table/:z/:x/:y.pbf', async (req, res) => {
   *   const tile = await tileCallback({
   *     datasourceId: 'my-postgis',
   *     schemaName: req.params.schema,
   *     tableName: req.params.table,
   *     geometryColumn: 'geom',
   *     srid: 4326,
   *     z: parseInt(req.params.z),
   *     x: parseInt(req.params.x),
   *     y: parseInt(req.params.y)
   *   });
   *   res.send(tile);
   * });
   * ```
   */
  async createPostGISTileService(
    pool: Pool,
    options: PostGISMVTPublisherOptions = {},
    customSql?: string
  ): Promise<PostGISMVTTileCallback> {
    const {
      maxZoom = 14,
      extent = 4096,
      buffer = 64,
      simplify = true
    } = options;

    return async (request: PostGISMVTTileRequest): Promise<Buffer | null> => {
      try {
        const client = await pool.connect();
        
        try {
          // Calculate tile bounds in Web Mercator (EPSG:3857)
          const tileBounds = this.calculateTileBounds(request.z, request.x, request.y);
          
          // Build the MVT query
          const query = this.buildMVTQuery(request, tileBounds, {
            extent,
            buffer,
            simplify,
            maxZoom
          }, customSql);
          
          // Execute query with tile bounds as parameters ($1, $2, $3, $4)
          const result = await client.query(query, [
            tileBounds.minX,
            tileBounds.minY,
            tileBounds.maxX,
            tileBounds.maxY
          ]);
          
          // Check if tile has data
          if (!result.rows[0] || !result.rows[0].mvt) {
            return null;
          }
          
          // Return the PBF buffer
          return Buffer.from(result.rows[0].mvt);
          
        } finally {
          client.release();
        }
      } catch (error) {
        console.error(
          `❌ Error generating PostGIS tile z=${request.z}, x=${request.x}, y=${request.y}:`,
          error
        );
        return null;
      }
    };
  }

  /**
   * Calculate tile bounds in Web Mercator coordinates
   */
  private calculateTileBounds(z: number, x: number, y: number): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const tileSize = 20037508.34; // Half circumference of Earth in meters
    
    const n = Math.pow(2, z);
    const minX = -tileSize + (x / n) * 2 * tileSize;
    const maxX = -tileSize + ((x + 1) / n) * 2 * tileSize;
    const maxY = tileSize - (y / n) * 2 * tileSize;
    const minY = tileSize - ((y + 1) / n) * 2 * tileSize;
    
    return { minX, minY, maxX, maxY };
  }

  /**
   * Build the SQL query for MVT generation
   * 
   * Uses ST_AsMVT() to aggregate features into a single MVT tile,
   * and ST_AsMVTGeom() to clip and transform geometries to tile coordinates.
   * If customSql is provided, it will be used as the base query instead of building from table name.
   */
  private buildMVTQuery(
    request: PostGISMVTTileRequest,
    tileBounds: { minX: number; minY: number; maxX: number; maxY: number },
    options: { extent: number; buffer: number; simplify: boolean; maxZoom: number },
    customSql?: string
  ): string {
    const { schemaName, tableName, geometryColumn, srid, z, x, y } = request;
    const { extent, buffer, simplify, maxZoom } = options;
    
    // Transform tile bounds to the source SRID
    const boundsTransform = srid === 3857 ? '' : `ST_Transform(`;
    const boundsTransformEnd = srid === 3857 ? '' : `, ${srid})`;
    
    // Build WHERE clause for spatial filter
    const whereClause = `
      ST_Intersects(
        "${geometryColumn}",
        ${boundsTransform}ST_MakeEnvelope($1, $2, $3, $4, 3857)${boundsTransformEnd}
      )
    `;
    
    // Build the MVT query
    // Note: ST_AsMVTGeom automatically handles simplification based on zoom level
    // ST_AsMVT requires the entire row as first parameter
    
    let baseQuery;
    if (customSql) {
      // Use custom SQL (e.g., from buffer operations)
      // The SQL has been constructed with explicit column names to avoid duplicates
      baseQuery = `(${customSql}) as t`;
    } else {
      // Use default table query
      baseQuery = `"${schemaName}"."${tableName}" as t`;
    }
    
    const query = `
      SELECT ST_AsMVT(
        sub,
        '${this.getLayerName(schemaName, tableName)}',
        ${extent},
        'mvt_geom'
      ) as mvt
      FROM (
        SELECT
          ST_AsMVTGeom(
            ST_Transform("${geometryColumn}", 3857),
            ST_MakeEnvelope($1, $2, $3, $4, 3857),
            ${extent},
            ${buffer},
            ${simplify ? 'true' : 'false'}
          ) as mvt_geom,
          ${this.buildPropertiesSelect(geometryColumn)}
        FROM ${baseQuery}
        WHERE ${whereClause}
      ) as sub
    `;
    
    return query;
  }

  /**
   * Build SELECT clause for feature properties
   * Excludes geometry column and system columns
   */
  private buildPropertiesSelect(geometryColumn: string): string {
    // For now, select all columns except geometry
    // In production, you might want to query information_schema to get column list
    return `
      (SELECT jsonb_object_agg(key, value)
       FROM jsonb_each(to_jsonb(t.*) - '${geometryColumn}' - 'tableoid' - 'cmin' - 'cmax' - 'xmin' - 'xmax' - 'ctid')) as properties
    `;
  }

  /**
   * Get layer name from schema and table
   * Format: "schema_table" or just "table" if schema is public
   */
  private getLayerName(schemaName: string, tableName: string): string {
    if (schemaName === 'public') {
      return tableName;
    }
    return `${schemaName}_${tableName}`;
  }

  /**
   * Create a simplified tile service for a specific table
   * 
   * This is a convenience method that wraps createTileService with pre-configured
   * table parameters.
   */
  async createTableTileService(
    pool: Pool,
    config: {
      schemaName: string;
      tableName: string;
      geometryColumn: string;
      srid: number;
    },
    options: PostGISMVTPublisherOptions = {}
  ): Promise<(z: number, x: number, y: number) => Promise<Buffer | null>> {
    const baseCallback = await this.createPostGISTileService(pool, options);
    
    return async (z: number, x: number, y: number): Promise<Buffer | null> => {
      return baseCallback({
        datasourceId: 'postgis',
        schemaName: config.schemaName,
        tableName: config.tableName,
        geometryColumn: config.geometryColumn,
        srid: config.srid,
        z,
        x,
        y
      });
    };
  }

  // Instance method wrappers for IMVTPublisher interface
  
  /**
   * Create tile service (instance method wrapper for IMVTPublisher)
   * 
   * For PostGIS, the dataProvider should return a Pool connection object.
   * The options can include schemaName and tableName for table-specific tiles.
   */
  async createTileService(
    datasourceId: string,
    dataProvider: () => Promise<any>,
    options?: any
  ): Promise<any> {
    // Get the connection pool from dataProvider
    const pool = await dataProvider();
    
    if (!pool) {
      throw new Error('PostGIS publisher requires a valid connection pool');
    }
    
    // Extract schema and table from options (if provided)
    const schemaName = options?.schemaName || 'public';
    const tableName = options?.tableName || datasourceId;
    const geometryColumn = options?.geometryColumn || 'geom';
    const srid = options?.srid || 4326;
    const customSql = options?.sql;  // Custom SQL from operations like buffer
    
    // Convert options to PostGIS-specific format
    const postgisOptions: PostGISMVTPublisherOptions = {
      maxZoom: options?.maxZoom,
      extent: options?.extent,
      buffer: options?.buffer,
      whereClause: options?.whereClause
    };
    
    // Call the original method with custom SQL if provided
    const baseCallback = await this.createPostGISTileService(pool, postgisOptions, customSql);
    
    // Wrap the callback to inject schema/table info
    // The callback receives MVTTileRequest object, not separate parameters
    return async (request: MVTTileRequest): Promise<Buffer | null> => {
      return baseCallback({
        ...request,
        schemaName,
        tableName,
        geometryColumn,
        srid
      });
    };
  }
  
  /**
   * Clear cached tile indices (instance method)
   * PostGIS doesn't cache, so this is a no-op
   */
  clearCache(datasourceId?: string): void {
    // PostGIS generates tiles on-the-fly from database, no caching needed
    console.log('ℹ️ PostGIS MVT publisher does not use caching');
  }

  /**
   * Get cache statistics (instance method)
   * PostGIS doesn't cache, so returns empty stats
   */
  getCacheStats(): { cachedDatasources: number; totalTilesGenerated?: number } {
    return {
      cachedDatasources: 0,
      totalTilesGenerated: undefined
    };
  }
}
