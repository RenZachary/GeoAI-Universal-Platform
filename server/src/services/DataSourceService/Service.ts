import type { DataSourceRepository } from '../../data-access/repositories';
import type { DataSourceRecord } from '../../data-access/repositories';
import { DataAccessFacade, MetadataFormatter } from '../../data-access';
import { wrapError, type PostGISConnectionConfig } from '../../core';
import { PostGISCleanupScheduler } from '../../storage';
import type Database from 'better-sqlite3';
import { DataSourceValidator } from './Validator';
import { PostGISConnector } from './PostGISConnector';
import { TableDiscoverer } from './TableDiscoverer';
import { DataSourceRegistrar } from './DataSourceRegistrar';
import { BboxCalculator } from './BboxCalculator';
import type { ConnectionInfo, RegisteredDataSource } from './types';

export class DataSourceService {
  private dataSourceRepo: DataSourceRepository;
  private dataAccess: DataAccessFacade;
  private cleanupSchedulers: Map<string, PostGISCleanupScheduler> = new Map();
  private db?: Database.Database;
  
  private validator: DataSourceValidator;
  private connector: PostGISConnector;
  private discoverer: TableDiscoverer;
  private registrar: DataSourceRegistrar;
  private bboxCalculator: BboxCalculator;

  constructor(dataSourceRepo: DataSourceRepository, workspaceBase?: string, db?: Database.Database) {
    this.dataSourceRepo = dataSourceRepo;
    this.dataAccess = DataAccessFacade.getInstance(workspaceBase);
    this.db = db;
    
    this.validator = new DataSourceValidator(dataSourceRepo);
    this.connector = new PostGISConnector(workspaceBase);
    this.discoverer = new TableDiscoverer(workspaceBase);
    this.registrar = new DataSourceRegistrar(dataSourceRepo);
    this.bboxCalculator = new BboxCalculator(this.dataAccess, dataSourceRepo);
    
    this.restorePostGISConnections();
  }

  private restorePostGISConnections(): void {
    try {
      const allSources = this.dataSourceRepo.listAll();
      const postgisSources = allSources.filter(ds => ds.type === 'postgis');
      
      if (postgisSources.length === 0) {
        console.log('[DataSourceService] No PostGIS data sources to restore');
        return;
      }
      
      const connectionConfigs = new Map<string, PostGISConnectionConfig>();
      
      for (const source of postgisSources) {
        const connection = source.metadata?.connection;
        if (connection && connection.host && connection.database && connection.user && connection.password) {
          const connectionKey = `${connection.host}:${connection.port || 5432}:${connection.database}`;
          
          if (!connectionConfigs.has(connectionKey)) {
            connectionConfigs.set(connectionKey, {
              host: connection.host,
              port: connection.port || 5432,
              database: connection.database,
              user: connection.user,
              password: connection.password,
              schema: connection.schema || 'public',
              name: source.name.split('.')[0]
            });
          }
        }
      }
      
      console.log(`[DataSourceService] Restoring ${connectionConfigs.size} PostGIS connection(s)...`);
      for (const [key, config] of connectionConfigs.entries()) {
        try {
          console.log(`[DataSourceService] Restoring connection: ${config.host}:${config.port}/${config.database}`);
          this.connector.configurePostGIS(config);
        } catch (error) {
          console.error(`[DataSourceService] ✗ Failed to restore connection ${key}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    } catch (error) {
      console.error('[DataSourceService] Error restoring PostGIS connections:', error);
    }
  }

  async listDataSources(): Promise<DataSourceRecord[]> {
    return this.dataSourceRepo.listAll();
  }

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

  formatDataSourcesForLLM(): string {
    const sources = this.dataSourceRepo.listAll();
    return MetadataFormatter.formatForLLM(sources);
  }

  getDataSourcesStructured() {
    const sources = this.dataSourceRepo.listAll();
    return MetadataFormatter.formatAsStructured(sources);
  }

  async getDataSourceById(id: string): Promise<DataSourceRecord | null> {
    return this.dataSourceRepo.getById(id);
  }

  async registerPostGISConnection(config: PostGISConnectionConfig): Promise<{
    connectionInfo: ConnectionInfo;
    dataSources: RegisteredDataSource[];
  }> {
    this.validator.validatePostGISConfig(config);
    await this.connector.testConnection(config);

    const tables = await this.discoverer.discoverAllSchemas();
    console.log(`[DataSourceService] Discovered ${tables.length} spatial tables across all schemas`);

    const connectionName = config.name || `PostGIS_${config.host}_${config.database}`;
    const registeredSources: RegisteredDataSource[] = [];

    for (const table of tables) {
      const dataSource = this.registrar.registerTableAsDataSource(table, config, connectionName);
      registeredSources.push(dataSource);
      
      this.bboxCalculator.calculateAndPersistBboxAsync(
        table.schema,
        table.tableName,
        table.geometryColumn,
        dataSource.id
      ).catch(err => {
        console.error(`[DataSourceService] Bbox calculation failed for ${table.tableName}:`, err instanceof Error ? err.message : 'Unknown error');
      });
    }

    const connectionKey = `${config.host}:${config.port || 5432}:${config.database}`;
    if (!this.cleanupSchedulers.has(connectionKey)) {
      const scheduler = new PostGISCleanupScheduler(config, {
        maxAge: 24 * 60 * 60 * 1000,
        interval: 60 * 60 * 1000,
        enableAutoCleanup: true
      }, this.db);
      await scheduler.start();
      this.cleanupSchedulers.set(connectionKey, scheduler);
      console.log(`[DataSourceService] Started temp table cleanup for connection: ${connectionKey}`);
    }

    return {
      connectionInfo: {
        host: config.host,
        database: config.database,
        schema: 'all',
        tableCount: registeredSources.length
      },
      dataSources: registeredSources
    };
  }

  async extractSchema(dataSourceId: string): Promise<any> {
    const dataSource = this.dataSourceRepo.getById(dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${dataSourceId}`);
    }

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

    if (this.validator.isFileBasedSource(dataSource.type)) {
      return {
        type: dataSource.type,
        reference: dataSource.reference,
        note: 'File-based data source - schema extracted during registration',
        featureCount: dataSource.metadata?.featureCount,
        bbox: dataSource.metadata?.bbox,
        crs: dataSource.metadata?.crs
      };
    }

    try {
      const schema = await this.dataAccess.getSchema(
        dataSource.type,
        dataSource.reference,
        dataSource.metadata?.tableName
      );
      
      return schema;
    } catch (error) {
      console.error(`[DataSourceService] Failed to extract schema via DataAccessFacade:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw wrapError(error, `Failed to extract schema: ${message}`);
    }
  }

  async searchDataSources(query: string): Promise<DataSourceRecord[]> {
    return this.dataSourceRepo.searchByName(query);
  }

  async updateMetadata(id: string, metadata: any): Promise<void> {
    this.dataSourceRepo.updateMetadata(id, metadata);
  }

  async deleteDataSource(id: string): Promise<void> {
    this.validator.preventPostGISDeletion(id);
    this.dataSourceRepo.delete(id);
  }

  async removePostGISConnection(connectionId: string): Promise<void> {
    const allSources = this.dataSourceRepo.listAll();
    
    const connectionSources = allSources.filter(ds => {
      return ds.type === 'postgis' && 
             ds.metadata?.connection &&
             this.getConnectionId(ds) === connectionId;
    });

    if (connectionSources.length === 0) {
      throw new Error(`No data sources found for connection: ${connectionId}`);
    }

    for (const source of connectionSources) {
      this.dataSourceRepo.delete(source.id);
    }

    console.log(`[DataSourceService] Removed connection ${connectionId} with ${connectionSources.length} tables`);
  }

  getPostGISConnections(): Array<{ id: string; name: string; host: string; database: string; tableCount: number }> {
    const allSources = this.dataSourceRepo.listAll();
    const postgisSources = allSources.filter(ds => ds.type === 'postgis');
    
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
          name: source.name.split('.')[0],
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

  private getConnectionId(dataSource: DataSourceRecord): string {
    const parts = dataSource.name.split('.');
    return parts.length > 0 ? parts[0] : dataSource.id;
  }

  registerManualDataSource(params: {
    name: string;
    type: 'shapefile' | 'geojson' | 'postgis' | 'tif' | 'mvt' | 'wms';
    reference: string;
    metadata?: Record<string, any>;
  }) {
    return this.registrar.registerManualDataSource(params);
  }
}
