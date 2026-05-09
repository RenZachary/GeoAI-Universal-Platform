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
   * 
   * DESIGN DECISION:
   * - PostGIS temporary tables: MUST be registered in SQLite for SQL operations
   * - File-based results (GeoJSON/Shapefile): Skip database registration
   *   → GeoAIGraph will register them in VirtualDataSourceManager (memory)
   *   → Memory-only storage provides natural conversation isolation
   *   → No need to pass conversationId through the entire call chain
   * 
   * @param result - The NativeData result from an operation
   * @param operation - Operation name (e.g., 'buffer', 'overlay')
   * @param sourceDataSource - Original data source that was operated on
   * @param params - Operation parameters for metadata
   * @returns Updated NativeData (ID unchanged for file-based results)
   */
  async persistResult(
    result: NativeData,
    operation: string,
    sourceDataSource: DataSourceRecord,
    params?: any
  ): Promise<NativeData> {
    // Case 1: PostGIS results (temporary tables) - MUST register in database
    // These are SQL-based and need database tracking for cleanup
    if (result.type === 'postgis' && result.metadata?.result?.table) {
      return this.persistPostGISResult(result, operation, sourceDataSource, params);
    }
    
    // Case 2: File-based results (GeoJSON, Shapefile) - SKIP database registration
    // These will be registered by GeoAIGraph in VirtualDataSourceManager (memory-only)
    // Memory storage provides automatic conversation isolation without passing conversationId
    console.log(`[ResultPersistenceService] Skipping database registration for file result (${result.type})`);
    console.log(`[ResultPersistenceService] File will be managed by VirtualDataSourceManager (memory)`);
    
    // Return result unchanged - GeoAIGraph will handle memory registration
    return result;
  }
  
  /**
   * Persist PostGIS temporary table results
   */
  private async persistPostGISResult(
    result: NativeData,
    operation: string,
    sourceDataSource: DataSourceRecord,
    params?: any
  ): Promise<NativeData> {
    const tableName = result.metadata.result.table;
    const schema = result.metadata.schema || 'public';

    // Mark geoai_temp tables as temporary intermediates
    // They will be registered in SQLite for workflow continuity but filtered from UI
    const isTemporary = schema === 'geoai_temp';
    if (isTemporary) {
      console.log(`[ResultPersistenceService] Registering temp table (will be hidden from UI): ${schema}.${tableName}`);
    } else {
      console.log(`[ResultPersistenceService] Persisting PostGIS result table: ${schema}.${tableName}`);
    }

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

    // Create DataSourceRecord for this result table
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
        isTemporary,  // Flag to indicate this is an intermediate result
        description: `${operation} result (${params?.distance ? `${params.distance} ${params.unit}` : ''})`
      }
    );

    console.log(`[ResultPersistenceService] Result persisted with ID: ${dataSourceRecord.id}`);

    // Update result ID to match the database record
    result.id = dataSourceRecord.id;

    return result;
  }

}
