/**
 * PostGIS Connection Manager - Handles connection pooling and reference parsing
 */

import { Pool, type PoolConfig } from 'pg';
import { wrapError } from '../core';
import type { PostGISConnectionConfig, ParsedPostGISReference } from '../core';

export class PostGISConnectionManager {
  private pool: Pool | null = null;
  private isConnected: boolean = false;

  /**
   * Create or reuse a connection pool
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
      console.log('[PostGIS Connection Manager] Connection established');
      return pool;
    } catch (error) {
      throw wrapError(error, 'Failed to connect to PostGIS');
    }
  }

  /**
   * Parse PostGIS reference string or metadata into connection info
   * Supports both URL format and schema.table format with metadata
   */
  static parseReference(
    sourceReference: string, 
    metadata?: any
  ): ParsedPostGISReference | null {
    try {
      // If metadata with connection info is provided, use it directly
      if (metadata?.connection) {
        const cinfo = metadata.connection;
        const refParts = sourceReference.split('.');
        const actualSchema = refParts.length > 1 ? refParts[0] : (cinfo.schema || 'public');
        const actualTableName = refParts.length > 1 ? refParts[1] : refParts[0];

        return {
          user: cinfo.user,
          password: cinfo.password,
          host: cinfo.host,
          port: Number(cinfo.port) || 5432,
          database: cinfo.database,
          schema: actualSchema,
          tableName: actualTableName,
          geometryColumn: metadata.geometryColumn || 'geom'
        };
      }

      // Fallback to URL parsing (legacy support)
      if (sourceReference.startsWith('postgis://')) {
        const url = new URL(sourceReference);
        if (url.protocol !== 'postgis:') return null;

        const params = new URLSearchParams(url.search);
        return {
          user: url.username,
          password: url.password,
          host: url.hostname,
          port: parseInt(url.port) || 5432,
          database: url.pathname.substring(1),
          schema: params.get('schema') || 'public',
          tableName: params.get('table') || undefined,
          sqlQuery: params.get('query') ? decodeURIComponent(params.get('query')!) : undefined,
          geometryColumn: params.get('geom') || 'geom'
        };
      }

      return null;
    } catch (error) {
      console.error('[PostGIS Connection Manager] Failed to parse reference:', error);
      return null;
    }
  }
}
