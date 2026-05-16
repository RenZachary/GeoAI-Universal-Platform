import type Database from 'better-sqlite3';
import type { DataSourceRepository} from '../../data-access/repositories';
import { type DataSourceRecord } from '../../data-access/repositories';
import { PublishingValidator } from './Validator';

export class PublishingRepository {
  private validator: PublishingValidator;

  constructor(
    private db: Database.Database,
    private dataSourceRepo: DataSourceRepository
  ) {
    this.validator = new PublishingValidator(dataSourceRepo);
  }

  getDataSourceById(dataSourceId: string): DataSourceRecord {
    return this.validator.validateDataSourceExists(dataSourceId);
  }

  updateMetadataWithWMSId(dataSourceId: string, wmsServiceId: string): void {
    const dataSource = this.dataSourceRepo.getById(dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${dataSourceId}`);
    }

    const updatedMetadata = {
      ...dataSource.metadata,
      wmsServiceId
    };
    
    this.dataSourceRepo.updateMetadata(dataSourceId, updatedMetadata);
  }
}
