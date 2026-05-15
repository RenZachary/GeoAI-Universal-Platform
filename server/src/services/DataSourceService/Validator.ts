import type { DataSourceRepository } from '../../data-access/repositories';
import type { PostGISConnectionConfig } from '../../core';
import { ValidationError } from './errors';
import { FILE_BASED_TYPES } from './constant';

export class DataSourceValidator {
  constructor(private dataSourceRepo: DataSourceRepository) {}

  validatePostGISConfig(config: PostGISConnectionConfig): void {
    if (!config.host || !config.database || !config.user || !config.password) {
      throw new ValidationError('Missing required fields: host, database, user, password');
    }

    if (config.port && (config.port < 1 || config.port > 65535)) {
      throw new ValidationError('Invalid port number');
    }
  }

  validateDataSourceExists(id: string): void {
    const dataSource = this.dataSourceRepo.getById(id);
    if (!dataSource) {
      throw new ValidationError(`Data source not found: ${id}`);
    }
  }

  preventPostGISDeletion(dataSourceId: string): void {
    const dataSource = this.dataSourceRepo.getById(dataSourceId);
    if (!dataSource) {
      throw new ValidationError(`Data source not found: ${dataSourceId}`);
    }

    if (dataSource.type === 'postgis') {
      throw new ValidationError('Cannot delete individual PostGIS tables. Please remove the entire connection instead.');
    }
  }

  isFileBasedSource(type: string): boolean {
    return FILE_BASED_TYPES.includes(type as any);
  }
}
