/**
 * PostGIS Connection Parser - Unified connection info parsing
 * 
 * Replaces PostGISConnectionManager with cleaner implementation.
 * Parses PostGIS reference strings and metadata into connection configuration.
 */

import type { ParsedPostGISReference } from '../../core';

export class PostGISConnectionParser {
  /**
   * Parse PostGIS reference and metadata into connection config
   * 
   * Priority:
   * 1. Use metadata.connection if available (preferred)
   * 2. Parse URL format (postgis://...)
   * 
   * @param sourceReference - Reference string (schema.table or postgis://...)
   * @param metadata - Optional metadata containing connection info
   * @returns Parsed connection info or null
   */
  static parse(
    sourceReference: string,
    metadata?: any
  ): ParsedPostGISReference | null {
    try {
      // Priority 1: Use metadata.connection if available
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

      // Priority 2: Parse URL format (postgis://...)
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
      console.error('[PostGISConnectionParser] Failed to parse:', error);
      return null;
    }
  }
}
