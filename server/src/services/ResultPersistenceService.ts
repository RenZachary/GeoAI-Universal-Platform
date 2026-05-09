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
import fs from 'fs';

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
    // Case 1: PostGIS results (temporary tables) - register in database
    if (result.type === 'postgis' && result.metadata?.result?.table) {
      return this.persistPostGISResult(result, operation, sourceDataSource, params);
    }
    
    // Case 2: File-based results (GeoJSON, Shapefile) - also register in database
    if (result.type === 'geojson' || result.type === 'shapefile') {
      return this.persistFileResult(result, operation, sourceDataSource, params);
    }
    
    // Case 3: Other types - skip persistence
    console.log(`[ResultPersistenceService] Skipping persistence for unsupported type: ${result.type}`);
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
  
  /**
   * Persist file-based results (GeoJSON, Shapefile, etc.)
   * These files are already on disk, but we need to register them in the database
   * so they can be tracked and used in subsequent workflow steps
   */
  private async persistFileResult(
    result: NativeData,
    operation: string,
    sourceDataSource: DataSourceRecord,
    params?: any
  ): Promise<NativeData> {
    const filePath = result.reference;
    
    console.log(`[ResultPersistenceService] Registering file result: ${filePath}`);
    
    // Create DataSourceRecord for this file result
    const dataSourceRecord = this.dataSourceRepo.create(
      `${operation}_${result.id}`,
      result.type,
      filePath,
      {
        ...result.metadata,
        operation,
        sourceDataSourceId: sourceDataSource.id,
        description: `${operation} result from ${sourceDataSource.name}`,
        isIntermediate: true,  // Mark as intermediate result
        createdAt: new Date().toISOString()  // Add timestamp for TTL cleanup
      }
    );
    
    console.log(`[ResultPersistenceService] File result registered with ID: ${dataSourceRecord.id}`);
    
    // Update result ID to match the database record
    result.id = dataSourceRecord.id;
    
    return result;
  }
  
  /**
   * Clean up old intermediate file results based on TTL
   * Should be called periodically (e.g., server startup or scheduled job)
   * 
   * @param ttlHours - Time-to-live in hours (default: 24 hours)
   * @returns Number of cleaned up records
   */
  async cleanupOldIntermediateFiles(ttlHours: number = 24): Promise<number> {
    console.log(`[ResultPersistenceService] Cleaning up intermediate files older than ${ttlHours} hours...`);
    
    const cutoffTime = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
    const cutoffIso = cutoffTime.toISOString();
    
    // Query all intermediate file results older than TTL
    const oldRecords = this.dataSourceRepo.listAll().filter(ds => {
      if (!ds.metadata?.isIntermediate) return false;
      if (ds.type === 'postgis') return false; // Skip PostGIS tables (handled separately)
      
      const createdAt = ds.metadata.createdAt || ds.createdAt;
      if (!createdAt) return false;
      
      return new Date(createdAt) < cutoffTime;
    });
    
    let cleanedCount = 0;
    
    for (const record of oldRecords) {
      try {
        // Delete physical file if it exists
        if (record.reference && !record.reference.startsWith('/api/')) {
          const filePath = record.reference;
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[ResultPersistenceService] Deleted old intermediate file: ${filePath}`);
          }
        }
        
        // Delete database record
        this.dataSourceRepo.delete(record.id);
        console.log(`[ResultPersistenceService] Deleted database record: ${record.id}`);
        
        cleanedCount++;
      } catch (error) {
        console.error(`[ResultPersistenceService] Failed to clean up record ${record.id}:`, error);
      }
    }
    
    console.log(`[ResultPersistenceService] Cleaned up ${cleanedCount} old intermediate files`);
    return cleanedCount;
  }
}
