/**
 * PostGIS Basic Operations - CRUD and metadata operations
 */

import type { Pool } from 'pg';
import type { NativeData, DataMetadata, FieldInfo } from '../../../../core';
import { generateId } from '../../../../core';
import type { TableSchema, ColumnInfo, IndexInfo } from '../../../interfaces';

export class PostGISBasicOperations {
  constructor(private pool: Pool, private schema: string) {}

  /**
   * Read data from PostGIS table/query
   */
  async read(reference: string): Promise<NativeData> {
    try {
      let featureCount = 0;
      let fields: FieldInfo[] = [];
      let srid = 4326;
      let actualSchema = this.schema;
      let tableName = reference;

      // Check if reference is a table name or SQL query
      if (reference.trim().toUpperCase().startsWith('SELECT')) {
        // It's a SQL query - execute it to get count
        const countResult = await this.pool.query(
          `SELECT COUNT(*) as count FROM (${reference}) AS subquery`
        );
        featureCount = parseInt(countResult.rows[0].count);
        fields = [{ name: 'query_result', type: 'string' }];
      } else {
        // It's a table name - parse schema and table
        const parts = reference.split('.');
        if (parts.length > 1) {
          actualSchema = parts[0];
          tableName = parts[1];
        } else {
          tableName = parts[0];
        }

        // Get feature count
        const countResult = await this.pool.query(
          `SELECT COUNT(*) as count FROM "${actualSchema}"."${tableName}"`
        );
        featureCount = parseInt(countResult.rows[0].count);

        // Get column names and types
        const columnsResult = await this.pool.query(
          `SELECT column_name, data_type FROM information_schema.columns 
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          [actualSchema, tableName]
        );
        fields = columnsResult.rows.map((row: any) => ({
          name: row.column_name as string,
          type: this.mapPostGISDataType(row.data_type)
        }));

        // Get SRID from geometry_columns
        const sridResult = await this.pool.query(
          `SELECT srid FROM geometry_columns 
           WHERE f_table_schema = $1 AND f_table_name = $2
           LIMIT 1`,
          [actualSchema, tableName]
        );

        if (sridResult.rows.length > 0) {
          srid = parseInt(sridResult.rows[0].srid);
        }
      }

      return {
        id: generateId(),
        type: 'postgis',
        reference,
        metadata: {
          crs: `EPSG:${srid}`,
          srid,
          featureCount,
          fields,
          database: this.pool.options.database,
          schema: actualSchema,
          // StandardizedOutput fields for data source
          result: null, // Data source has no computation result
          description: 'PostGIS data source loaded successfully'
        },
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('[PostGISBasicOperations] Error reading data:', error);
      throw error;
    }
  }

  /**
   * Write data to PostGIS table
   */
  async write(data: any, metadata?: Partial<DataMetadata>): Promise<string> {
    // TODO: Implement GeoJSON to PostGIS import
    throw new Error('PostGIS write operation not yet implemented');
  }

  /**
   * Delete data by reference
   */
  async delete(reference: string): Promise<void> {
    // TODO: Implement table/row deletion
    throw new Error('PostGIS delete operation not yet implemented');
  }

  /**
   * Get metadata for existing data
   */
  async getMetadata(reference: string): Promise<DataMetadata> {
    const nativeData = await this.read(reference);
    return nativeData.metadata;
  }

  /**
   * Validate data format integrity
   */
  async validate(reference: string): Promise<boolean> {
    try {
      const tableName = reference.split('.').pop() || reference;
      
      // Check if table exists
      const result = await this.pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = $1 AND table_name = $2
        )`,
        [this.schema, tableName]
      );

      return result.rows[0].exists;
    } catch (error) {
      console.error('[PostGISBasicOperations] Validation failed:', error);
      return false;
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('[PostGISBasicOperations] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Execute raw SQL query
   */
  async executeQuery(sql: string, params?: any[]): Promise<any[]> {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  /**
   * Get table/column information
   */
  async getSchema(tableName: string): Promise<TableSchema> {
    // Get columns
    const columnsResult = await this.pool.query(
      `SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
      [this.schema, tableName]
    );

    const columns: ColumnInfo[] = columnsResult.rows.map((row: any) => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default,
      isPrimaryKey: false, // TODO: Determine from constraints
      isGeometryColumn: row.data_type === 'USER-DEFINED',
      srid: undefined // TODO: Extract from geometry_columns
    }));

    // Get indexes
    const indexesResult = await this.pool.query(
      `SELECT
        i.relname as index_name,
        ix.indisunique as is_unique,
        array_agg(a.attname) as columns
      FROM pg_class t,
           pg_class i,
           pg_index ix,
           pg_attribute a
      WHERE t.oid = ix.indrelid
        AND i.oid = ix.indexrelid
        AND a.attrelid = t.oid
        AND a.attnum = ANY(ix.indkey)
        AND t.relkind = 'r'
        AND t.relname = $1
      GROUP BY i.relname, ix.indisunique
      ORDER BY i.relname`,
      [tableName]
    );

    const indexes: IndexInfo[] = indexesResult.rows.map((row: any) => ({
      name: row.index_name,
      columns: row.columns,
      isUnique: row.is_unique,
      isSpatial: row.index_name.includes('_geom') || row.index_name.includes('_idx')
    }));

    return {
      tableName,
      columns,
      primaryKey: undefined, // TODO: Extract from constraints
      indexes
    };
  }

  /**
   * List available tables
   */
  async listTables(): Promise<string[]> {
    const result = await this.pool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [this.schema]
    );

    return result.rows.map((row: any) => row.table_name as string);
  }

  /**
   * Get spatial reference system info
   */
  async getSRID(tableName: string, geometryColumn: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT srid FROM geometry_columns 
       WHERE f_table_schema = $1 AND f_table_name = $2 AND f_geometry_column = $3
       LIMIT 1`,
      [this.schema, tableName, geometryColumn]
    );

    if (result.rows.length === 0) {
      throw new Error(`Geometry column ${geometryColumn} not found in ${tableName}`);
    }

    return parseInt(result.rows[0].srid);
  }

  /**
   * Get spatial extent
   */
  async getSpatialExtent(tableName: string, geometryColumn: string): Promise<[number, number, number, number]> {
    const result = await this.pool.query(
      `SELECT ST_Extent(${geometryColumn}) as extent FROM ${this.schema}.${tableName}`
    );

    const extent = result.rows[0].extent;
    if (!extent) {
      throw new Error(`No spatial extent found for ${tableName}`);
    }

    // Parse BOX(xmin ymin,xmax ymax) format
    const match = extent.match(/BOX\(([\d.-]+)\s+([\d.-]+),([\d.-]+)\s+([\d.-]+)\)/);
    if (!match) {
      throw new Error(`Invalid extent format: ${extent}`);
    }

    return [
      parseFloat(match[1]),
      parseFloat(match[2]),
      parseFloat(match[3]),
      parseFloat(match[4])
    ];
  }

  /**
   * Check if geometry column exists
   */
  async hasGeometryColumn(tableName: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT EXISTS (
        SELECT FROM geometry_columns 
        WHERE f_table_schema = $1 AND f_table_name = $2
      )`,
      [this.schema, tableName]
    );

    return result.rows[0].exists;
  }

  /**
   * Map PostGIS data types to unified field types
   */
  private mapPostGISDataType(postgisType: string): string {
    const typeMap: Record<string, string> = {
      'integer': 'number',
      'bigint': 'number',
      'smallint': 'number',
      'numeric': 'number',
      'decimal': 'number',
      'real': 'number',
      'double precision': 'number',
      'float': 'number',
      'text': 'string',
      'character varying': 'string',
      'varchar': 'string',
      'char': 'string',
      'character': 'string',
      'boolean': 'boolean',
      'bool': 'boolean',
      'date': 'date',
      'timestamp': 'date',
      'timestamptz': 'date',
      'time': 'date',
      'json': 'object',
      'jsonb': 'object',
      'bytea': 'binary',
      'uuid': 'string',
      'USER-DEFINED': 'geometry' // PostGIS geometry types
    };

    return typeMap[postgisType.toLowerCase()] || 'string';
  }
}
