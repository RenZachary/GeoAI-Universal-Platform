/**
 * PostGIS Utilities - Common helper functions for PostGIS operations
 */

import type { DataSourceRecord } from '../repositories';
import type { PostGISConnectionConfig } from '../../core';

/**
 * Parse PostGIS connection config from DataSourceRecord
 * Extracts connection information from data source metadata
 */
export function parseConnectionConfig(
  dataSource: DataSourceRecord
): PostGISConnectionConfig | null {
  if (dataSource.type !== 'postgis' || !dataSource.metadata?.connection) {
    return null;
  }

  const conn = dataSource.metadata.connection;

  return {
    host: String(conn.host),
    port: Number(conn.port) || 5432,
    database: String(conn.database),
    user: String(conn.user),
    password: String(conn.password),
    schema: String(conn.schema || 'public')
  };
}

/**
 * Convert distance to degrees (for PostGIS WGS84 operations)
 * 
 * @param distance - Distance value
 * @param unit - Distance unit (meters, kilometers, feet, miles, degrees)
 * @returns Distance in degrees
 */
export function convertDistanceUnit(distance: number, unit?: string): number {
  switch (unit) {
    case 'meters':
      return distance / 111320;
    case 'kilometers':
      return (distance * 1000) / 111320;
    case 'feet':
      return distance / 364567;
    case 'miles':
      return distance / 69.172;
    default:
      return distance; // Already in degrees
  }
}
