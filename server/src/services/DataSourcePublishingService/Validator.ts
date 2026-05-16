import type { DataSourceRepository, DataSourceRecord } from '../../data-access/repositories';
import { ValidationError, NotFoundError } from './errors';
import fs from 'fs';

export class PublishingValidator {
  constructor(private dataSourceRepo: DataSourceRepository) {}

  validateDataSourceExists(dataSourceId: string): DataSourceRecord {
    const dataSource = this.dataSourceRepo.getById(dataSourceId);
    
    if (!dataSource) {
      throw new NotFoundError(`Data source not found: ${dataSourceId}`);
    }

    return dataSource;
  }

  validatePostGISConnection(dataSource: DataSourceRecord): void {
    if (dataSource.type === 'postgis') {
      const connection = dataSource.metadata?.connection;
      
      if (!connection) {
        throw new ValidationError(`PostGIS data source missing connection info: ${dataSource.id}`);
      }

      const tableName = dataSource.metadata?.tableName || 
                       (dataSource.metadata?.result && typeof dataSource.metadata.result === 'object' ? dataSource.metadata.result.table : undefined);
      const sqlQuery = dataSource.metadata?.sqlQuery;

      if (!tableName && !sqlQuery) {
        throw new ValidationError(
          `PostGIS data source must have either tableName or sqlQuery in metadata. ` +
          `Data source ID: ${dataSource.id}, Metadata keys: ${Object.keys(dataSource.metadata).join(', ')}`
        );
      }
    }
  }

  validateFileExists(filePath: string | undefined, dataSourceId: string, fileType: string): void {
    if (!filePath) {
      throw new NotFoundError(`${fileType} file path not specified for data source: ${dataSourceId}`);
    }

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError(`${fileType} file not found: ${dataSourceId}, path: ${filePath}`);
    }
  }
}
