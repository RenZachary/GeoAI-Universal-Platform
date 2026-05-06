/**
 * PostGIS Accessor - Handles PostgreSQL/PostGIS database operations
 * 
 * Delegates operations to modular operation classes
 */

import type { NativeData, DataMetadata } from '../../core';
import { wrapError } from '../../core';
import type { DatabaseAccessor, TableSchema, ColumnInfo, IndexInfo, BufferOptions, OverlayOptions, FilterCondition } from '../interfaces';
import type { PoolConfig, QueryResultRow } from 'pg';
import { Pool } from 'pg';
import type { PostGISConnectionConfig } from '../../core';
import { 
  PostGISBasicOperations,
  PostGISBufferOperation,
  PostGISOverlayOperation,
  PostGISFilterOperation,
  PostGISAggregationOperation,
  PostGISSpatialJoinOperation
} from './impl/postgis';
import { PostGISStatisticalOperation } from './impl/postgis/operations/PostGISStatisticalOperation';

// Type for PostgreSQL query result rows
 
interface PgQueryRow extends QueryResultRow {
  [key: string]: any;
}

// Type for GeoJSON data
interface GeoJSONData {
  type: string;
  features?: Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geometry: any;
    properties?: Record<string, unknown>;
  }>;
}

export class PostGISAccessor implements DatabaseAccessor {
  readonly type = 'postgis' as const;
  
  private config: PostGISConnectionConfig;
  private pool: Pool | null = null;
  
  // Operation modules
  private basicOps: PostGISBasicOperations | null = null;
  private bufferOp: PostGISBufferOperation | null = null;
  private overlayOp: PostGISOverlayOperation | null = null;
  private filterOp: PostGISFilterOperation | null = null;
  private aggOp: PostGISAggregationOperation | null = null;
  private joinOp: PostGISSpatialJoinOperation | null = null;
  public statisticalOp: PostGISStatisticalOperation | null = null;
  
  constructor(config: PostGISConnectionConfig) {
    this.config = config;
  }
  
  /**
   * Get or create connection pool
   */
  private getPool(): Pool {
    if (!this.pool) {
      const poolConfig: PoolConfig = {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        max: 10, // Connection pool size
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };
      
      this.pool = new Pool(poolConfig);
      
      // Handle pool errors
      this.pool.on('error', (err) => {
        console.error('[PostGISAccessor] Unexpected pool error:', err);
      });
    }
    
    return this.pool;
  }
  
  /**
   * Lazy initialize operation modules
   */
  private initOperations() {
    const pool = this.getPool();
    const schema = this.config.schema || 'public';
    
    if (!this.basicOps) this.basicOps = new PostGISBasicOperations(pool, schema);
    if (!this.bufferOp) this.bufferOp = new PostGISBufferOperation(pool, schema);
    if (!this.overlayOp) this.overlayOp = new PostGISOverlayOperation(pool, schema);
    if (!this.filterOp) this.filterOp = new PostGISFilterOperation(pool, schema);
    if (!this.aggOp) this.aggOp = new PostGISAggregationOperation(pool, schema);
    if (!this.joinOp) this.joinOp = new PostGISSpatialJoinOperation(pool, schema);
    if (!this.statisticalOp) this.statisticalOp = new PostGISStatisticalOperation(pool, schema);
  }
  
  /**
   * Read data from PostGIS table/query
   */
  async read(reference: string): Promise<NativeData> {
    this.initOperations();
    return this.basicOps!.read(reference);
  }
  
  /**
   * Write data to PostGIS table
   */
  async write(data: unknown, metadata?: Partial<DataMetadata>): Promise<string> {
    this.initOperations();
    return this.basicOps!.write(data, metadata);
  }
  
  /**
   * Delete data from PostGIS (drop table or delete rows)
   */
  async delete(reference: string): Promise<void> {
    this.initOperations();
    return this.basicOps!.delete(reference);
  }
  
  /**
   * Get metadata for PostGIS table
   */
  async getMetadata(reference: string): Promise<DataMetadata> {
    this.initOperations();
    return this.basicOps!.getMetadata(reference);
  }
  
  /**
   * Validate PostGIS table exists and has valid geometry
   */
  async validate(reference: string): Promise<boolean> {
    this.initOperations();
    return this.basicOps!.validate(reference);
  }
  
  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    const pool = this.getPool();
    
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      console.error('[PostGISAccessor] Connection test failed:', error);
      return false;
    }
  }
  
  /**
   * Execute raw SQL query
   */
  async executeQuery(sql: string, params?: unknown[]): Promise<PgQueryRow[]> {
    const pool = this.getPool();
    
    try {
      const result = await pool.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('[PostGISAccessor] Query execution error:', error);
      throw wrapError(error, 'Failed to execute query');
    }
  }
  
  /**
   * Execute raw SQL query and return full result (with rows property)
   * This is used by DataSourceService for table discovery
   */
  async executeRaw(sql: string, params?: unknown[]): Promise<{ rows: PgQueryRow[] }> {
    const pool = this.getPool();
    
    try {
      const result = await pool.query(sql, params);
      return { rows: result.rows };
    } catch (error) {
      console.error('[PostGISAccessor] Raw query execution error:', error);
      throw wrapError(error, 'Failed to execute raw query');
    }
  }
  
  /**
   * Get table schema information
   */
  async getSchema(tableName: string): Promise<TableSchema> {
    const pool = this.getPool();
    const schema = this.config.schema || 'public';
    
    try {
      // Get columns
      const columnsResult = await pool.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, tableName]
      );
      
      const columns: ColumnInfo[] = columnsResult.rows.map((row: PgQueryRow) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default,
        isPrimaryKey: false, // TODO: Check primary key
      }));
      
      // Get indexes
      const indexesResult = await pool.query(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = $1 AND tablename = $2`,
        [schema, tableName]
      );
      
      const indexes: IndexInfo[] = indexesResult.rows.map((row: PgQueryRow) => ({
        name: row.indexname,
        columns: [], // TODO: Extract from indexdef
        isUnique: row.indexname.includes('_key'),
      }));
      
      return {
        tableName: `${schema}.${tableName}`,
        columns,
        indexes,
      };
    } catch (error) {
      console.error('[PostGISAccessor] Schema retrieval error:', error);
      throw wrapError(error, 'Failed to get schema');
    }
  }
  
  /**
   * List available tables in database
   */
  async listTables(): Promise<string[]> {
    const pool = this.getPool();
    const schema = this.config.schema || 'public';
    
    try {
      const result = await pool.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
        [schema]
      );
      
      return result.rows.map((row: PgQueryRow) => row.table_name as string);
    } catch (error) {
      console.error('[PostGISAccessor] List tables error:', error);
      throw wrapError(error, 'Failed to list tables');
    }
  }
  
  /**
   * Get SRID for geometry column
   */
  async getSRID(tableName: string, geometryColumn: string): Promise<number> {
    const pool = this.getPool();
    const schema = this.config.schema || 'public';
    
    try {
      const result = await pool.query(
        `SELECT srid FROM geometry_columns 
         WHERE f_table_schema = $1 AND f_table_name = $2 AND f_geometry_column = $3`,
        [schema, tableName, geometryColumn]
      );
      
      if (result.rows.length > 0) {
        return parseInt(result.rows[0].srid);
      }
      
      return 4326; // Default
    } catch (error) {
      console.error('[PostGISAccessor] Get SRID error:', error);
      return 4326;
    }
  }
  
  /**
   * Get spatial extent of table
   */
  async getSpatialExtent(tableName: string, geometryColumn: string): Promise<[number, number, number, number]> {
    const pool = this.getPool();
    const schema = this.config.schema || 'public';
    
    try {
      const result = await pool.query(
        `SELECT ST_Extent(${geometryColumn}) as extent FROM ${schema}.${tableName}`
      );
      
      if (result.rows.length > 0 && result.rows[0].extent) {
        // Parse extent string: "BOX(minX minY,maxX maxY)"
        const extentStr = result.rows[0].extent;
        const match = extentStr.match(/BOX\(([^)]+)\)/);
        
        if (match) {
          const coords = match[1].split(',');
          const minCoords = coords[0].trim().split(' ').map(Number);
          const maxCoords = coords[1].trim().split(' ').map(Number);
          
          return [minCoords[0], minCoords[1], maxCoords[0], maxCoords[1]];
        }
      }
      
      return [-180, -90, 180, 90]; // World extent default
    } catch (error) {
      console.error('[PostGISAccessor] Get spatial extent error:', error);
      return [-180, -90, 180, 90];
    }
  }
  
  /**
   * Check if table has geometry column
   */
  async hasGeometryColumn(tableName: string): Promise<boolean> {
    const pool = this.getPool();
    const schema = this.config.schema || 'public';
    
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM geometry_columns 
         WHERE f_table_schema = $1 AND f_table_name = $2`,
        [schema, tableName]
      );
      
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error('[PostGISAccessor] Check geometry column error:', error);
      return false;
    }
  }
  
  /**
   * Private helper: Ensure connection is established
   */
  private async ensureConnection(): Promise<void> {
    // Connection pool is lazily initialized by getPool()
    this.getPool();
  }
  
  /**
   * Perform buffer operation using PostGIS ST_Buffer()
   */
  /**
   * Perform buffer operation using PostGIS ST_Buffer
   */
  async buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
    this.initOperations();
    return this.bufferOp!.execute(reference, distance, options);
  }
  
  /**
   * Perform overlay operation using PostGIS spatial functions
   */
  async overlay(reference1: string, reference2: string, options: OverlayOptions): Promise<NativeData> {
    this.initOperations();
    return this.overlayOp!.execute(reference1, reference2, options);
  }
  
  /**
   * Filter data based on attribute or spatial conditions
   */
  async filter(reference: string, filterCondition: FilterCondition): Promise<NativeData> {
    this.initOperations();
    return this.filterOp!.execute(reference, filterCondition);
  }
  
  /**
   * Aggregate data (SUM, AVG, COUNT, MAX, MIN)
   */
  async aggregate(reference: string, aggFunc: string, field: string, returnFeature: boolean = false): Promise<NativeData> {
    this.initOperations();
    return this.aggOp!.execute(reference, aggFunc, field, returnFeature);
  }
  
  /**
   * Spatial join between two datasets
   */
  async spatialJoin(
    targetReference: string,
    joinReference: string,
    operation: string,
    joinType: string = 'inner'
  ): Promise<NativeData> {
    this.initOperations();
    return this.joinOp!.execute(targetReference, joinReference, operation, joinType);
  }
  
  /**
   * Get unique values for a specific field (for categorical rendering)
   */
  async getUniqueValues(reference: string, fieldName: string): Promise<string[]> {
    const pool = this.getPool();
    const schema = this.config.schema || 'public';
    
    // Parse reference to get table name
    // Format: "schema.tableName" or just "tableName"
    const parts = reference.split('.');
    const tableName = parts.length > 1 ? parts[1] : parts[0];
    const actualSchema = parts.length > 1 ? parts[0] : schema;
    
    // Query distinct values from the table
    const query = `
      SELECT DISTINCT "${fieldName}"
      FROM "${actualSchema}"."${tableName}"
      WHERE "${fieldName}" IS NOT NULL
      ORDER BY "${fieldName}"
    `;
    
    try {
      const result = await pool.query(query);
      return result.rows.map(row => String(row[fieldName]));
    } catch (error) {
      console.error(`[PostGISAccessor] Failed to get unique values for field ${fieldName}:`, error);
      const wrappedError = new Error(`Failed to extract unique values: ${error instanceof Error ? error.message : 'Unknown error'}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }
}
