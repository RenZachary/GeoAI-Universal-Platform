/**
 * Data Source Service - Business Logic for Data Source Management
 * 
 * Responsibilities:
 * - PostGIS connection management and validation
 * - Spatial table discovery and enrichment
 * - Data source registration with metadata
 * - Schema extraction and caching
 */

import type { DataSourceRepository} from '../data-access/repositories';
import { type DataSourceRecord } from '../data-access/repositories';
import { DataAccessFacade } from '../data-access';
import type { PostGISConnectionConfig } from '../core';
import { PostGISCleanupScheduler } from '../storage';
import type Database from 'better-sqlite3';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ConnectionInfo {
  host: string;
  database: string;
  schema: string;
  tableCount: number;
}

export interface RegisteredDataSource {
  id: string;
  name: string;
  tableName: string;
  geometryType: string;
  rowCount: number;
}

export interface TableInfo {
  schema: string;
  tableName: string;
  geometryColumn: string;
  srid: number;
  geometryType: string;
  rowCount: number;
  fields: UnifiedFieldInfo[];
  description: string | null;
}

export interface FieldInfo {
  columnName: string;
  dataType: string;
  isNullable: string;
  maxLength?: number;
}

export interface UnifiedFieldInfo {
  name: string;
  type: string;
}

// ============================================================================
// Custom Error Classes
// ============================================================================

export class DataSourceError extends Error {
  constructor(message: string, public code: string = 'DATA_SOURCE_ERROR') {
    super(message);
    this.name = 'DataSourceError';
  }
}

export class ConnectionError extends DataSourceError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

export class ValidationError extends DataSourceError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Service Implementation
// ============================================================================

export class DataSourceService {
  private dataSourceRepo: DataSourceRepository;
  private dataAccess: DataAccessFacade;
  private cleanupSchedulers: Map<string, PostGISCleanupScheduler> = new Map();
  private db?: Database.Database;  // Optional SQLite DB for cleanup scheduler

  constructor(dataSourceRepo: DataSourceRepository, workspaceBase?: string, db?: Database.Database) {
    this.dataSourceRepo = dataSourceRepo;
    this.dataAccess = DataAccessFacade.getInstance(workspaceBase);
    this.db = db;
  }

  // ==========================================================================
  // Public API - Data Source Operations
  // ==========================================================================

  /**
   * List all registered data sources
   */
  async listDataSources(): Promise<DataSourceRecord[]> {
    return this.dataSourceRepo.listAll();
  }

  /**
   * Get available data sources for LLM context (simplified format)
   * Excludes temporary/intermediate results
   */
  async getAvailableDataSources(): Promise<any[]> {
    const sources = this.dataSourceRepo.listAll();  // listAll already filters temp tables
    
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      type: source.type,
      description: source.metadata?.description || 'No description',
      metadata: {
        geometryType: source.metadata?.geometryType,
        featureCount: source.metadata?.featureCount || source.metadata?.rowCount,
        fields: source.metadata?.fields
      }
    }));
  }

  /**
   * Get data source by ID
   */
  async getDataSourceById(id: string): Promise<DataSourceRecord | null> {
    return this.dataSourceRepo.getById(id);
  }

  /**
   * Register PostGIS connection and discover spatial tables
   * 
   * @param config - PostGIS connection configuration
   * @returns Connection info and registered data sources
   * @throws ConnectionError if connection fails
   * @throws ValidationError if configuration is invalid
   */
  async registerPostGISConnection(config: PostGISConnectionConfig): Promise<{
    connectionInfo: ConnectionInfo;
    dataSources: RegisteredDataSource[];
  }> {
    // Step 1: Validate configuration
    this.validatePostGISConfig(config);

    // Step 2: Test connection
    await this.testConnection(config);

    // Step 3: Discover spatial tables from ALL schemas
    const tables = await this.discoverSpatialTablesAllSchemas();

    console.log(`[DataSourceService] Discovered ${tables.length} spatial tables across all schemas`);

    // Step 4: Register each table as a data source and calculate bbox asynchronously
    const connectionName = config.name || `PostGIS_${config.host}_${config.database}`;
    const registeredSources: RegisteredDataSource[] = [];

    for (const table of tables) {
      // 4.1 Register data source immediately (without bbox)
      const dataSource = await this.registerTableAsDataSource(table, config, connectionName);
      registeredSources.push(dataSource);
      
      // 4.2 Calculate bbox asynchronously (non-blocking)
      this.calculateAndPersistBboxAsync(
        table.schema,
        table.tableName,
        table.geometryColumn,
        dataSource.id
      ).catch(err => {
        console.error(`[DataSourceService] Bbox calculation failed for ${table.tableName}:`, err instanceof Error ? err.message : 'Unknown error');
      });
    }

    // Step 5: Start cleanup scheduler for this connection
    const connectionKey = `${config.host}:${config.port || 5432}:${config.database}`;
    if (!this.cleanupSchedulers.has(connectionKey)) {
      const scheduler = new PostGISCleanupScheduler(config, {
        maxAge: 24 * 60 * 60 * 1000,
        interval: 60 * 60 * 1000,
        enableAutoCleanup: true
      }, this.db);  // Pass SQLite DB for metadata cleanup
      await scheduler.start();
      this.cleanupSchedulers.set(connectionKey, scheduler);
      console.log(`[DataSourceService] Started temp table cleanup for connection: ${connectionKey}`);
    }

    return {
      connectionInfo: {
        host: config.host,
        database: config.database,
        schema: 'all', // Indicates all schemas were scanned
        tableCount: registeredSources.length
      },
      dataSources: registeredSources
    };
  }

  /**
   * Extract schema for a data source
   */
  async extractSchema(dataSourceId: string): Promise<any> {
    const dataSource = this.dataSourceRepo.getById(dataSourceId);
    
    if (!dataSource) {
      throw new ValidationError(`Data source not found: ${dataSourceId}`);
    }

    // Return cached schema if available
    const fieldSchemas = dataSource.metadata?.fieldSchemas || dataSource.metadata?.fields;
    if (fieldSchemas && Array.isArray(fieldSchemas)) {
      return {
        tableName: dataSource.metadata.tableName,
        schema: dataSource.metadata.connection?.schema || 'public',
        fields: fieldSchemas,
        geometryColumn: dataSource.metadata.geometryColumn,
        geometryType: dataSource.metadata.geometryType,
        srid: dataSource.metadata.srid
      };
    }

    // For now, return placeholder - actual implementation would fetch from DB
    return {
      note: 'Schema extraction requires active connection',
      hint: 'Schema should be cached during registration'
    };
  }

  /**
   * Search data sources by name
   */
  async searchDataSources(query: string): Promise<DataSourceRecord[]> {
    return this.dataSourceRepo.searchByName(query);
  }

  /**
   * Update data source metadata
   */
  async updateMetadata(id: string, metadata: any): Promise<void> {
    this.dataSourceRepo.updateMetadata(id, metadata);
  }

  /**
   * Delete data source
   * Prevents deletion of PostGIS data sources (tables)
   */
  async deleteDataSource(id: string): Promise<void> {
    const dataSource = this.dataSourceRepo.getById(id);
    
    if (!dataSource) {
      throw new ValidationError(`Data source not found: ${id}`);
    }

    // Prevent deletion of PostGIS data sources
    if (dataSource.type === 'postgis') {
      throw new ValidationError('Cannot delete individual PostGIS tables. Please remove the entire connection instead.');
    }

    this.dataSourceRepo.delete(id);
  }

  /**
   * Remove PostGIS connection and all its associated data sources
   */
  async removePostGISConnection(connectionId: string): Promise<void> {
    const allSources = this.dataSourceRepo.listAll();
    
    // Find all data sources belonging to this connection
    const connectionSources = allSources.filter(ds => {
      return ds.type === 'postgis' && 
             ds.metadata?.connection &&
             this.getConnectionId(ds) === connectionId;
    });

    if (connectionSources.length === 0) {
      throw new ValidationError(`No data sources found for connection: ${connectionId}`);
    }

    // Delete all data sources in this connection
    for (const source of connectionSources) {
      this.dataSourceRepo.delete(source.id);
    }

    console.log(`[DataSourceService] Removed connection ${connectionId} with ${connectionSources.length} tables`);
  }

  /**
   * Get list of PostGIS connections
   */
  getPostGISConnections(): Array<{ id: string; name: string; host: string; database: string; tableCount: number }> {
    const allSources = this.dataSourceRepo.listAll();
    const postgisSources = allSources.filter(ds => ds.type === 'postgis');
    
    // Group by connection
    const connectionMap = new Map<string, {
      id: string;
      name: string;
      host: string;
      database: string;
      tableCount: number;
    }>();

    for (const source of postgisSources) {
      const connectionId = this.getConnectionId(source);
      
      if (!connectionMap.has(connectionId)) {
        const connection = source.metadata?.connection;
        connectionMap.set(connectionId, {
          id: connectionId,
          name: source.name.split('.')[0], // Extract connection name from "connection.schema.table"
          host: connection?.host || 'unknown',
          database: connection?.database || 'unknown',
          tableCount: 0
        });
      }
      const connection = connectionMap.get(connectionId);
      if(connection) connection.tableCount++;
    }

    return Array.from(connectionMap.values());
  }

  /**
   * Extract connection ID from data source
   * Format: "connectionName.schema.tableName" -> "connectionName"
   */
  private getConnectionId(dataSource: DataSourceRecord): string {
    const parts = dataSource.name.split('.');
    return parts.length > 0 ? parts[0] : dataSource.id;
  }

  // ==========================================================================
  // Private Methods - Business Logic
  // ==========================================================================

  /**
   * Validate PostGIS configuration
   */
  private validatePostGISConfig(config: PostGISConnectionConfig): void {
    if (!config.host || !config.database || !config.user || !config.password) {
      throw new ValidationError('Missing required fields: host, database, user, password');
    }

    if (config.port && (config.port < 1 || config.port > 65535)) {
      throw new ValidationError('Invalid port number');
    }
  }

  /**
   * Test PostGIS connection
   */
  private async testConnection(config: PostGISConnectionConfig): Promise<void> {
    try {
      console.log(`[DataSourceService] Testing PostGIS connection to ${config.host}:${config.port || 5432}/${config.database}`);

      // Configure PostGIS backend
      this.dataAccess.configurePostGIS({
        host: config.host,
        port: config.port || 5432,
        database: config.database,
        user: config.user,
        password: config.password,
        schema: config.schema || 'public'
      });

      // Get PostGIS backend and test connection
      const postGISBackend = this.dataAccess.getPostGISBackend();
      if (!postGISBackend) {
        throw new ConnectionError('PostGIS backend not configured');
      }
      
      const isConnected = await (postGISBackend as any).testConnection();

      if (!isConnected) {
        throw new ConnectionError('Failed to connect to PostGIS database. Please check credentials.');
      }

      console.log('[DataSourceService] PostGIS connection successful');
    } catch (error) {
      if (error instanceof ConnectionError) {
        throw error;
      }
      throw new ConnectionError(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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

  /**
   * Discover spatial tables in ALL PostGIS schemas
   */
  private async discoverSpatialTablesAllSchemas(): Promise<TableInfo[]> {
    try {
      const postGISBackend = this.dataAccess.getPostGISBackend();
      if (!postGISBackend) {
        throw new Error('PostGIS backend not configured');
      }

      // Query geometry_columns for ALL spatial tables (excluding geoai_temp schema)
      const query = `
        SELECT 
          f_table_schema AS "schema",
          f_table_name AS "tableName",
          f_geometry_column AS "geometryColumn",
          srid,
          type AS "geometryType"
        FROM geometry_columns
        WHERE f_table_schema != 'geoai_temp'
        ORDER BY f_table_schema, f_table_name
      `;

      const result = await (postGISBackend as any).executeRaw(query);
      const tables = result.rows || [];

      console.log(`[DataSourceService] Found ${tables.length} spatial tables in geometry_columns`);

      // Enrich with row counts and field schemas (parallel execution)
      const enrichedTables = await Promise.all(
        tables.map(async (table: any) => {
          try {
            const schema = table.schema;
            const tableName = table.tableName;
            console.log(`[DataSourceService] Enriching table: ${schema}.${tableName}`);

            // Get row count
            const countQuery = `SELECT COUNT(*) as count FROM "${schema}"."${tableName}"`;
            console.log(`[DataSourceService] Executing count query for ${schema}.${tableName}`);
            const countResult = await (postGISBackend as any).executeRaw(countQuery);
            const rowCount = parseInt(countResult.rows[0].count, 10);
            console.log(`[DataSourceService] Row count for ${schema}.${tableName}: ${rowCount}`);

            // Get field schema from information_schema
            const schemaQuery = `
              SELECT 
                column_name AS "columnName",
                data_type AS "dataType",
                is_nullable AS "isNullable",
                character_maximum_length AS "maxLength"
              FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = $2
              ORDER BY ordinal_position
            `;
            console.log(`[DataSourceService] Fetching schema for ${schema}.${tableName}`);
            const schemaResult = await (postGISBackend as any).executeRaw(schemaQuery, [schema, tableName]);
            const fieldSchemas = schemaResult.rows || [];
            
            // Convert to unified format: [{name, type}, ...]
            const fields = fieldSchemas.map((f: any) => ({
              name: f.columnName,
              type: this.mapPostGISDataType(f.dataType)
            }));
            
            console.log(`[DataSourceService] Found ${fields.length} fields for ${schema}.${tableName}`);

            return {
              ...table,
              rowCount,
              fields, // Store as object array
              description: null
            };
          } catch (err) {
            console.warn(`[DataSourceService] Failed to enrich table ${table.schema}.${table.tableName}:`, err);
            return {
              ...table,
              rowCount: 0,
              fields: [],
              description: null
            };
          }
        })
      );

      console.log(`[DataSourceService] Successfully enriched ${enrichedTables.length} tables`);
      // Log summary of first few tables
      enrichedTables.slice(0, 3).forEach(table => {
        console.log(`[DataSourceService] Table ${table.schema}.${table.tableName}: rowCount=${table.rowCount}, fields=${table.fields.length}`);
      });

      return enrichedTables;
    } catch (error) {
      console.error('[DataSourceService] Error discovering spatial tables:', error);
      throw new DataSourceError(`Failed to discover tables: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Register a single table as a data source
   */
  private async registerTableAsDataSource(
    table: TableInfo,
    config: PostGISConnectionConfig,
    connectionName: string
  ): Promise<RegisteredDataSource> {
    const schema = table.schema || config.schema || 'public';

    const dataSource = this.dataSourceRepo.create(
      `${connectionName}.${schema}.${table.tableName}`,
      'postgis',
      `${schema}.${table.tableName}`,
      {
        connection: {
          host: config.host,
          port: config.port || 5432,
          database: config.database,
          user: config.user,
          password: config.password, // Note: In production, use encryption or external vault
          schema,
          password_encrypted: false
        },
        tableName: table.tableName,
        geometryColumn: table.geometryColumn,
        srid: table.srid,
        crs: `EPSG:${table.srid}`, // Convert SRID to CRS format (e.g., EPSG:4326)
        geometryType: table.geometryType,
        rowCount: table.rowCount,
        featureCount: table.rowCount, // Alias for consistency with file-based sources
        description: table.description,
        fields: table.fields, // Store as object array [{name, type}, ...]
        fieldSchemas: table.fields || [] // Keep detailed schema for backward compatibility
      }
    );

    return {
      id: dataSource.id,
      name: dataSource.name,
      tableName: table.tableName,
      geometryType: table.geometryType,
      rowCount: table.rowCount
    };
  }

  // ==========================================================================
  // Private Methods - Bbox Calculation
  // ==========================================================================

  /**
   * Calculate and persist bbox asynchronously
   */
  private async calculateAndPersistBboxAsync(
    schema: string,
    tableName: string,
    geometryColumn: string,
    dataSourceId: string
  ): Promise<void> {
    console.log(`[DataSourceService] Calculating bbox for ${schema}.${tableName}...`);
    
    // Calculate bbox with timeout control
    const bbox = await this.calculateSpatialExtentWithTimeout(
      schema,
      tableName,
      geometryColumn,
      30000 // 30 seconds timeout
    );
    
    // Persist to metadata
    this.dataSourceRepo.updateMetadata(dataSourceId, { bbox });
    
    console.log(`[DataSourceService] Bbox persisted for ${schema}.${tableName}:`, bbox);
  }

  /**
   * Calculate spatial extent with timeout control
   */
  private async calculateSpatialExtentWithTimeout(
    schema: string,
    tableName: string,
    geometryColumn: string,
    timeoutMs: number = 30000
  ): Promise<[number, number, number, number]> {
    // Timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Bbox calculation timeout (${timeoutMs}ms)`)),
        timeoutMs
      );
    });
    
    const calculationPromise = this.calculateSpatialExtent(schema, tableName, geometryColumn);
    
    try {
      return await Promise.race([calculationPromise, timeoutPromise]);
    } catch (error) {
      console.warn(`[DataSourceService] Bbox calculation failed for ${schema}.${tableName}:`, error instanceof Error ? error.message : 'Unknown error');
      // Return world extent as default
      return [-180, -90, 180, 90];
    }
  }

  /**
   * Calculate spatial extent using ST_Extent
   */
  private async calculateSpatialExtent(
    schema: string,
    tableName: string,
    geometryColumn: string
  ): Promise<[number, number, number, number]> {
    // First get row count to decide strategy
    const postGISBackend = this.dataAccess.getPostGISBackend();
    if (!postGISBackend) {
      throw new Error('PostGIS backend not configured');
    }
    
    const countQuery = `SELECT COUNT(*) as count FROM "${schema}"."${tableName}"`;
    const countResult = await (postGISBackend as any).executeRaw(countQuery);
    const rowCount = parseInt(countResult.rows[0].count, 10);
    
    let extent: string;
    
    if (rowCount > 10_000_000) {
      // Large table: use 1% sampling
      console.log(`[DataSourceService] Using sampling for large table ${schema}.${tableName} (${rowCount} rows)`);
      const sampleQuery = `
        SELECT ST_Extent(geom) as extent FROM (
          SELECT "${geometryColumn}" as geom
          FROM "${schema}"."${tableName}"
          TABLESAMPLE SYSTEM(1)
        ) AS sample
      `;
      const result = await (postGISBackend as any).executeRaw(sampleQuery);
      extent = result.rows[0]?.extent;
    } else {
      // Regular table: exact calculation
      const query = `
        SELECT ST_Extent("${geometryColumn}") as extent
        FROM "${schema}"."${tableName}"
        WHERE "${geometryColumn}" IS NOT NULL
      `;
      const result = await (postGISBackend as any).executeRaw(query);
      extent = result.rows[0]?.extent;
    }
    
    if (!extent) {
      console.warn(`[DataSourceService] No spatial extent for ${schema}.${tableName}`);
      return [-180, -90, 180, 90];
    }
    
    // Parse "BOX(xmin ymin,xmax ymax)" format
    return this.parseBoxExtent(extent);
  }

  /**
   * Parse BOX extent format
   */
  private parseBoxExtent(extent: string): [number, number, number, number] {
    // Format: BOX(xmin ymin,xmax ymax)
    const match = extent.match(/BOX\(([\d.eE+-]+)\s+([\d.eE+-]+),([\d.eE+-]+)\s+([\d.eE+-]+)\)/);
    
    if (!match) {
      throw new Error(`Invalid extent format: ${extent}`);
    }
    
    return [
      parseFloat(match[1]), // minX
      parseFloat(match[2]), // minY
      parseFloat(match[3]), // maxX
      parseFloat(match[4])  // maxY
    ];
  }

  /**
   * Register a data source manually (for file-based sources)
   * 
   * @param params - Data source parameters
   * @returns Registered DataSourceRecord
   */
  registerManualDataSource(params: {
    name: string;
    type: 'shapefile' | 'geojson' | 'postgis' | 'tif' | 'mvt' | 'wms';
    reference: string;
    metadata?: Record<string, any>;
  }): DataSourceRecord {
    const { name, type, reference, metadata = {} } = params;
    
    // Create DataSourceRecord
    const dataSource = this.dataSourceRepo.create(
      name,
      type,
      reference,
      metadata
    );
    
    console.log(`[DataSourceService] Manually registered data source: ${name} (${type})`);
    
    return dataSource;
  }
}
