/**
 * PostGIS SQL Utilities - Common helper functions for operations
 */

import type { Pool } from 'pg';

/**
 * Get column names from a table, excluding specified columns
 * @param pool - PostgreSQL connection pool
 * @param schema - Table schema
 * @param tableName - Table name
 * @param excludeColumns - Columns to exclude (default: ['geom'])
 * @param alias - Optional table alias for qualified column names
 * @returns Comma-separated list of quoted column names with optional alias prefix
 */
export async function getColumnList(
  pool: Pool,
  schema: string,
  tableName: string,
  excludeColumns: string[] = ['geom'],
  alias?: string
): Promise<string> {
  const placeholders = excludeColumns.map((_, i) => `$${i + 3}`).join(', ');
  
  const result = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = $1 AND table_name = $2 
      AND column_name NOT IN (${placeholders})
    ORDER BY ordinal_position
  `, [schema, tableName, ...excludeColumns]);
  
  const columns = result.rows.map(row => {
    const columnName = row.column_name;
    return alias ? `${alias}."${columnName}"` : `"${columnName}"`;
  });
  
  return columns.join(', ');
}

/**
 * Parse a table reference into schema and table name
 * @param reference - Table reference in format "schema.table" or just "table"
 * @param defaultSchema - Default schema if not specified in reference
 * @returns Object with schema and tableName
 */
export function parseTableReference(
  reference: string,
  defaultSchema: string = 'public'
): { schema: string; tableName: string } {
  if (reference.includes('.')) {
    const parts = reference.split('.');
    return {
      schema: parts[0],
      tableName: parts[1]
    };
  }
  
  return {
    schema: defaultSchema,
    tableName: reference
  };
}
