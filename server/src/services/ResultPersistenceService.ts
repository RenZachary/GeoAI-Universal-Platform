/**
 * Result Persistence Service - Handles analysis result persistence
 * 
 * Responsible for persisting analysis results (especially PostGIS temporary tables)
 * to the DataSourceRepository so they can be referenced by subsequent workflow steps.
 * 
 * This service separates persistence concerns from executors, following single responsibility principle.
 */

import type { NativeData } from '../core';
import type { DataSourceRecord } from '../data-access/repositories';
import { DataSourceRepository } from '../data-access/repositories';
import type Database from 'better-sqlite3';

export class ResultPersistenceService {
  private dataSourceRepo: DataSourceRepository;

  constructor(db: Database.Database) {
    this.dataSourceRepo = new DataSourceRepository(db);
  }

  /**
   * Persist analysis result to data source registry
   * Only persists PostGIS results (temporary tables need to be registered)
   * 
   * @param result - The NativeData result from an operation
   * @param operation - Operation name (e.g., 'buffer', 'overlay')
   * @param sourceDataSource - Original data source that was operated on
   * @param params - Operation parameters for metadata
   * @returns Updated NativeData with persisted ID
   */
  async persistResult(
    result: NativeData,
    operation: string,
    sourceDataSource: DataSourceRecord,
    params?: any
  ): Promise<NativeData> {
    // Only persist PostGIS results (temporary tables)
    if (result.type !== 'postgis' || !result.metadata?.result?.table) {
      console.log(`[ResultPersistenceService] Skipping persistence for non-PostGIS result: ${result.type}`);
      return result;
    }

    const tableName = result.metadata.result.table;
    const schema = result.metadata.schema || 'public';

    console.log(`[ResultPersistenceService] Persisting PostGIS result table: ${schema}.${tableName}`);

    // Preserve original connection info from source data source
    const connectionInfo = sourceDataSource.metadata?.connection ? {
      connection: {
        host: sourceDataSource.metadata.connection.host,
        port: sourceDataSource.metadata.connection.port,
        database: sourceDataSource.metadata.connection.database,
        user: sourceDataSource.metadata.connection.user,
        password: sourceDataSource.metadata.connection.password,
        schema: sourceDataSource.metadata.connection.schema || 'public'
      }
    } : {};

    // Create DataSourceRecord for this temporary table
    const dataSourceRecord = this.dataSourceRepo.create(
      `${operation}_${tableName}`,
      'postgis',
      `${schema}.${tableName}`,
      {
        ...result.metadata,
        ...connectionInfo,
        operation,
        distance: params?.distance,
        unit: params?.unit,
        description: `${operation} result (${params?.distance ? `${params.distance} ${params.unit}` : ''})`
      }
    );

    console.log(`[ResultPersistenceService] Result persisted with ID: ${dataSourceRecord.id}`);

    // Update result ID to match the database record
    result.id = dataSourceRecord.id;

    return result;
  }
}
