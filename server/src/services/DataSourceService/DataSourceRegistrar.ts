import type { DataSourceRepository } from '../../data-access/repositories';
import type { PostGISConnectionConfig } from '../../core';
import type { TableInfo, RegisteredDataSource } from './types';

export class DataSourceRegistrar {
  constructor(private dataSourceRepo: DataSourceRepository) {}

  registerTableAsDataSource(
    table: TableInfo,
    config: PostGISConnectionConfig,
    connectionName: string
  ): RegisteredDataSource {
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
          password: config.password,
          schema,
          password_encrypted: false
        },
        tableName: table.tableName,
        geometryColumn: table.geometryColumn,
        srid: table.srid,
        crs: `EPSG:${table.srid}`,
        geometryType: table.geometryType,
        rowCount: table.rowCount,
        featureCount: table.rowCount,
        description: table.description,
        fields: table.fields,
        fieldSchemas: table.fields
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

  registerManualDataSource(params: {
    name: string;
    type: 'shapefile' | 'geojson' | 'postgis' | 'tif' | 'mvt' | 'wms';
    reference: string;
    metadata?: Record<string, any>;
  }) {
    const { name, type, reference, metadata = {} } = params;
    
    const dataSource = this.dataSourceRepo.create(name, type, reference, metadata);
    
    console.log(`[DataSourceRegistrar] Manually registered: ${name} (${type})`);
    
    return dataSource;
  }
}
