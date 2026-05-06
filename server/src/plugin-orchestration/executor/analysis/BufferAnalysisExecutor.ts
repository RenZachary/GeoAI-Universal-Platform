/**
 * Buffer Analysis Plugin Executor
 * 
 * Architecture:
 * - Receives dataSourceId (abstract identifier)
 * - Queries DataSourceRepository for metadata (type, reference)
 * - Uses DataAccessor.buffer() method
 * - Accessor handles format-specific buffer implementation:
 *   - GeoJSON: Turf.js buffer
 *   - Shapefile: Convert to GeoJSON → Turf.js buffer
 *   - PostGIS: ST_Buffer() SQL
 * - Executor focuses ONLY on orchestration
 */

import type { NativeData } from '../../../core/index';
import { DataAccessorFactory } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';

export interface BufferAnalysisParams {
  dataSourceId: string;  // Abstract ID, not file path
  distance: number;
  unit: 'meters' | 'kilometers' | 'feet' | 'miles';
  dissolve?: boolean;
}

export class BufferAnalysisExecutor {
  private db: Database.Database;
  private dataSourceRepo: DataSourceRepository;
  private accessorFactory: DataAccessorFactory;

  constructor(db: Database.Database, workspaceBase?: string) {
    this.db = db;
    this.dataSourceRepo = new DataSourceRepository(db);
    this.accessorFactory = new DataAccessorFactory(workspaceBase);
  }

  /**
   * Execute buffer analysis
   * 
   * Flow:
   * 1. Look up dataSourceId in database to get type and reference
   * 2. Create appropriate accessor based on type
   * 3. Call accessor.buffer() - accessor handles everything!
   * 4. Return result NativeData
   */
  async execute(params: BufferAnalysisParams): Promise<NativeData> {
    console.log('[BufferAnalysisExecutor] Starting buffer analysis...');
    console.log('[BufferAnalysisExecutor] Params:', params);

    // Step 1: Query database for data source metadata
    const dataSource = this.dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }

    console.log('[BufferAnalysisExecutor] Found data source:', {
      id: dataSource.id,
      name: dataSource.name,
      type: dataSource.type,
      reference: dataSource.reference
    });

    // Step 2: Create appropriate accessor
    const accessor = this.accessorFactory.createAccessor(dataSource.type);
    console.log('[BufferAnalysisExecutor] Created accessor for type:', dataSource.type);

    // Step 3: Call buffer - accessor handles ALL format-specific logic!
    const result = await accessor.buffer(
      dataSource.reference,
      params.distance,
      {
        unit: params.unit,
        dissolve: params.dissolve
      }
    );

    console.log('[BufferAnalysisExecutor] Buffer completed successfully');
    console.log('[BufferAnalysisExecutor] Result:', result);

    // Ensure standardized output field exists (REQUIRED by type system)
    if (result.metadata && result.metadata.result === undefined) {
      // For buffer analysis, result is the buffered geometry reference
      result.metadata.result = result.reference;
    }

    return result;
  }
}
