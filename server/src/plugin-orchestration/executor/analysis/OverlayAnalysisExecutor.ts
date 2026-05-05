/**
 * Overlay Analysis Plugin Executor
 * 
 * Architecture:
 * - Receives two dataSourceIds (abstract identifiers)
 * - Queries DataSourceRepository for metadata (type, reference)
 * - Uses DataAccessor.overlay() method
 * - Accessor handles format-specific overlay implementation:
 *   - GeoJSON: Turf.js overlay operations
 *   - Shapefile: Convert to GeoJSON → Turf.js overlay
 *   - PostGIS: ST_Intersection(), ST_Union(), etc. SQL
 * - Executor focuses ONLY on orchestration
 */

import type { NativeData } from '../../../core';
import { DataAccessorFactory } from '../../../data-access/factories/DataAccessorFactory';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';

export interface OverlayAnalysisParams {
  inputDataSourceId: string;      // Primary data source ID
  overlayDataSourceId: string;    // Overlay data source ID
  operation: 'intersect' | 'union' | 'difference' | 'symmetric_difference';
}

export class OverlayAnalysisExecutor {
  private db: Database.Database;
  private dataSourceRepo: DataSourceRepository;
  private accessorFactory: DataAccessorFactory;

  constructor(db: Database.Database, workspaceBase?: string) {
    this.db = db;
    this.dataSourceRepo = new DataSourceRepository(db);
    this.accessorFactory = new DataAccessorFactory(workspaceBase);
  }

  /**
   * Execute overlay analysis
   * 
   * Flow:
   * 1. Look up both dataSourceIds in database to get types and references
   * 2. Create appropriate accessors based on types
   * 3. Call accessor.overlay() - accessor handles everything!
   * 4. Return result NativeData
   */
  async execute(params: OverlayAnalysisParams): Promise<NativeData> {
    console.log('[OverlayAnalysisExecutor] Starting overlay analysis...');
    console.log('[OverlayAnalysisExecutor] Params:', params);

    // Step 1: Query database for both data sources
    const dataSource1 = this.dataSourceRepo.getById(params.inputDataSourceId);
    const dataSource2 = this.dataSourceRepo.getById(params.overlayDataSourceId);
    
    if (!dataSource1) {
      throw new Error(`Input data source not found: ${params.inputDataSourceId}`);
    }
    
    if (!dataSource2) {
      throw new Error(`Overlay data source not found: ${params.overlayDataSourceId}`);
    }

    console.log('[OverlayAnalysisExecutor] Found data sources:', {
      input: { id: dataSource1.id, name: dataSource1.name, type: dataSource1.type },
      overlay: { id: dataSource2.id, name: dataSource2.name, type: dataSource2.type }
    });

    // Step 2: For now, use the first data source's accessor
    // TODO: Implement cross-data-source overlay logic
    // For mixed types, we may need to convert one to match the other
    const accessor = this.accessorFactory.createAccessor(dataSource1.type);
    console.log('[OverlayAnalysisExecutor] Using accessor for type:', dataSource1.type);

    // Step 3: Call overlay - accessor handles ALL format-specific logic!
    const result = await accessor.overlay(
      dataSource1.reference,
      dataSource2.reference,
      {
        operation: params.operation
      }
    );

    console.log('[OverlayAnalysisExecutor] Overlay completed successfully');
    console.log('[OverlayAnalysisExecutor] Result:', result);

    // Ensure standardized output field exists (REQUIRED by type system)
    if (result.metadata && result.metadata.result === undefined) {
      // For overlay analysis, result is the overlayed geometry reference
      result.metadata.result = result.reference;
    }

    return result;
  }
}
