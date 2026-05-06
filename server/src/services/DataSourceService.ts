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
import { DataAccessorFactory } from '../data-access';
import { generateId } from '../core';

// ============================================================================
// Type Definitions
// ============================================================================

export interface PostGISConnectionConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  schema?: string;
  name?: string;
}

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
  tableName: string;
  geometryColumn: string;
  srid: number;
  geometryType: string;
  rowCount: number;
  fields: FieldInfo[];
  description: string | null;
}

export interface FieldInfo {
  columnName: string;
  dataType: string;
  isNullable: string;
  maxLength?: number;
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
  private accessorFactory: DataAccessorFactory;

  constructor(dataSourceRepo: DataSourceRepository, workspaceBase?: string) {
    this.dataSourceRepo = dataSourceRepo;
    this.accessorFactory = new DataAccessorFactory(workspaceBase);
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
   */
  async getAvailableDataSources(): Promise<any[]> {
    const sources = this.dataSourceRepo.listAll();
    
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

    // Step 3: Discover spatial tables with schemas
    const schema = config.schema || 'public';
    const tables = await this.discoverSpatialTables(config, schema);

    console.log(`[DataSourceService] Discovered ${tables.length} spatial tables`);

    // Step 4: Register each table as a data source
    const connectionName = config.name || `PostGIS_${config.host}_${config.database}`;
    const registeredSources: RegisteredDataSource[] = [];

    for (const table of tables) {
      const dataSource = await this.registerTableAsDataSource(table, config, connectionName);
      registeredSources.push(dataSource);
    }

    return {
      connectionInfo: {
        host: config.host,
        database: config.database,
        schema,
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
   */
  async deleteDataSource(id: string): Promise<void> {
    this.dataSourceRepo.delete(id);
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

      // Configure factory with connection
      this.accessorFactory.configurePostGIS({
        host: config.host,
        port: config.port || 5432,
        database: config.database,
        user: config.user,
        password: config.password,
        schema: config.schema || 'public'
      });

      // Create accessor and test
      const accessor = this.accessorFactory.createAccessor('postgis');
      const isConnected = await (accessor as any).testConnection();

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
   * Discover spatial tables in PostGIS database
   */
  private async discoverSpatialTables(config: PostGISConnectionConfig, schema: string): Promise<TableInfo[]> {
    try {
      const accessor = this.accessorFactory.createAccessor('postgis');

      // Query geometry_columns for spatial tables
      const query = `
        SELECT 
          f_table_name AS "tableName",
          f_geometry_column AS "geometryColumn",
          srid,
          type AS "geometryType"
        FROM geometry_columns
        WHERE f_table_schema = $1
        ORDER BY f_table_name
      `;

      const result = await (accessor as any).executeRaw(query, [schema]);
      const tables = result.rows || [];

      // Enrich with row counts and field schemas (parallel execution)
      const enrichedTables = await Promise.all(
        tables.map(async (table: any) => {
          try {
            // Get row count
            const countQuery = `SELECT COUNT(*) as count FROM "${schema}"."${table.tableName}"`;
            const countResult = await (accessor as any).executeRaw(countQuery);
            const rowCount = parseInt(countResult.rows[0].count, 10);

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
            const schemaResult = await (accessor as any).executeRaw(schemaQuery, [schema, table.tableName]);
            const fields = schemaResult.rows || [];

            return {
              ...table,
              rowCount,
              fields,
              description: null
            };
          } catch (err) {
            console.warn(`[DataSourceService] Failed to enrich table ${table.tableName}:`, err);
            return {
              ...table,
              rowCount: 0,
              fields: [],
              description: null
            };
          }
        })
      );

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
    const dataSourceId = generateId();
    const schema = config.schema || 'public';

    const dataSource = this.dataSourceRepo.create(
      `${connectionName}.${table.tableName}`,
      'postgis',
      `${schema}.${table.tableName}`,
      {
        connection: {
          host: config.host,
          port: config.port || 5432,
          database: config.database,
          user: config.user,
          schema,
          password_encrypted: true
        },
        tableName: table.tableName,
        geometryColumn: table.geometryColumn,
        srid: table.srid,
        geometryType: table.geometryType,
        rowCount: table.rowCount,
        description: table.description,
        fields: table.fields.map(f => f.columnName), // Store field names as string array
        fieldSchemas: table.fields || [] // Store detailed schema separately
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
}
