/**
 * PostGIS Tile Generator - Shared utility for PostGIS MVT tile generation
 * 
 * This class provides common PostGIS functionality used by both
 * MVTOnDemandPublisher and MVTStrategyPublisher to avoid code duplication.
 */

import type { PoolConfig } from 'pg';
import { Pool } from 'pg';
import { wrapError } from '../../../core';
import type { PostGISConnectionConfig, ParsedPostGISReference } from '../../../core';

export interface PostGISTileQuery {
  tableName?: string;
  sqlQuery?: string;
  geometryColumn?: string;
}

export interface PostGISTileResult {
  success: boolean;
  tileBuffer?: Buffer;
  error?: string;
}

/**
 * Shared PostGIS tile generator
 * Handles connection pooling and tile generation using ST_AsMVT()
 */
export class PostGISTileGenerator {
  private pool: Pool | null = null;
  private isConnected: boolean = false;

  /**
   * Create and test PostGIS connection pool
   */
  async createPool(config: PostGISConnectionConfig): Promise<Pool> {
    if (this.pool && this.isConnected) {
      return this.pool;
    }

    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    const pool = new Pool(poolConfig);

    // Test connection
    try {
      await pool.query('SELECT 1');
      this.pool = pool;
      this.isConnected = true;
      console.log('[PostGIS Tile Generator] Connection established');
      return pool;
    } catch (error) {
      throw wrapError(error, 'Failed to connect to PostGIS');
    }
  }

  /**
   * Generate a single MVT tile from PostGIS
   */
  async generateTile(
    pool: Pool,
    z: number,
    x: number,
    y: number,
    query: PostGISTileQuery,
    options: {
      extent?: number;
      layerName?: string;
      schema?: string;
    } = {}
  ): Promise<PostGISTileResult> {
    const {
      extent = 4096,
      layerName = 'default',
      schema = 'public'
    } = options;

    const geometryColumn = query.geometryColumn || 'geom';

    let sql: string;
    let params: any[];

    try {
      if (query.tableName) {
        // Table-based query
        sql = `
          SELECT ST_AsMVT(q, $1, $2, $3) as tile
          FROM (
            SELECT ST_Transform(${geometryColumn}, 3857) as ${geometryColumn}
            FROM ${schema}.${query.tableName}
            WHERE ST_Intersects(ST_Transform(${geometryColumn}, 3857), ST_TileEnvelope($4, $5, $6))
          ) q
        `;
        // ST_AsMVT signature: (rows, name, extent, geom_name)
        params = [layerName, extent, geometryColumn, z, x, y];
      } else if (query.sqlQuery) {
        // Custom SQL query - assume the query already handles projection or returns 3857
        sql = `
          SELECT ST_AsMVT(q, $1, $2, $3) as tile
          FROM (
            ${query.sqlQuery}
          ) q
          WHERE ST_Intersects(${geometryColumn}, ST_TileEnvelope($4, $5, $6))
        `;
        // ST_AsMVT signature: (rows, name, extent, geom_name)
        params = [layerName, extent, geometryColumn, z, x, y];
      } else {
        return {
          success: false,
          error: 'PostGIS query must specify either tableName or sqlQuery'
        };
      }

      const result = await pool.query(sql, params);

      if (result.rows.length === 0 || !result.rows[0].tile) {
        return {
          success: true,
          tileBuffer: null as any  // Empty tile is valid
        };
      }

      return {
        success: true,
        tileBuffer: result.rows[0].tile
      };
    } catch (error) {
      console.error('[PostGIS Tile Generator] Query failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Close the connection pool
   */
  async closePool(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      console.log('[PostGIS Tile Generator] Connection pool closed');
    }
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected && this.pool !== null;
  }

  /**
   * Parse PostGIS reference string to extract connection info
   * Format: postgis://user:pass@host:port/database?table=tablename&geom=geom
   */
  static parseReference(reference: string): ParsedPostGISReference | null {
    try {
      const url = new URL(reference);
      
      if (url.protocol !== 'postgis:') {
        return null;
      }
      
      const params = new URLSearchParams(url.search);
      
      return {
        user: url.username,
        password: url.password,
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.substring(1), // Remove leading /
        schema: params.get('schema') || 'public',
        tableName: params.get('table') || undefined,
        sqlQuery: params.get('query') ? decodeURIComponent(params.get('query')!) : undefined,
        geometryColumn: params.get('geom') || 'geom'
      };
    } catch (error) {
      console.error('[PostGIS Tile Generator] Failed to parse reference:', error);
      return null;
    }
  }
}
