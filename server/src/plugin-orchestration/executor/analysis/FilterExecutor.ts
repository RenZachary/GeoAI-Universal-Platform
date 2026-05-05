/**
 * Filter Plugin Executor
 * 
 * Architecture:
 * - Receives dataSourceId and filter conditions
 * - Queries DataSourceRepository for metadata
 * - Uses DataAccessor.filter() method
 * - Accessor handles format-specific filtering:
 *   - GeoJSON: JavaScript array filter
 *   - Shapefile: Convert to GeoJSON → filter
 *   - PostGIS: SQL WHERE clause
 * - Executor focuses ONLY on orchestration
 */

import type { NativeData } from '../../../core/index';
import type { FilterCondition } from '../../../data-access/interfaces';
import { DataAccessorFactory } from '../../../data-access/factories/DataAccessorFactory';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';

export interface FilterParams {
  dataSourceId: string;
  conditions: FilterCondition | FilterCondition[];
}

export class FilterExecutor {
  private db: Database.Database;
  private dataSourceRepo: DataSourceRepository;
  private accessorFactory: DataAccessorFactory;

  constructor(db: Database.Database, workspaceBase?: string) {
    this.db = db;
    this.dataSourceRepo = new DataSourceRepository(db);
    this.accessorFactory = new DataAccessorFactory(workspaceBase);
  }

  /**
   * Execute filter operation
   * 
   * Flow:
   * 1. Look up dataSourceId in database
   * 2. Create appropriate accessor
   * 3. Call accessor.filter() with conditions
   * 4. Return filtered NativeData
   */
  async execute(params: FilterParams): Promise<NativeData> {
    console.log('[FilterExecutor] Starting filter operation...');
    console.log('[FilterExecutor] Params:', params);

    // Step 1: Query database for data source metadata
    const dataSource = this.dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }

    console.log('[FilterExecutor] Found data source:', {
      id: dataSource.id,
      name: dataSource.name,
      type: dataSource.type,
      reference: dataSource.reference
    });

    // Step 2: Create appropriate accessor
    const accessor = this.accessorFactory.createAccessor(dataSource.type);
    console.log('[FilterExecutor] Created accessor for type:', dataSource.type);

    // Step 3: Call filter - accessor handles ALL format-specific logic!
    const conditions = Array.isArray(params.conditions) 
      ? this.combineConditions(params.conditions)
      : params.conditions;

    const result = await accessor.filter(dataSource.reference, conditions);

    console.log('[FilterExecutor] Filter completed successfully');
    console.log('[FilterExecutor] Result feature count:', result.metadata?.featureCount);

    // Ensure standardized output field exists (REQUIRED by type system)
    if (result.metadata && result.metadata.result === undefined) {
      result.metadata.result = result.metadata.featureCount || 0;
    }

    return result;
  }

  /**
   * Combine multiple conditions with AND connector
   */
  private combineConditions(conditions: FilterCondition[]): FilterCondition {
    if (conditions.length === 1) {
      return conditions[0];
    }

    return {
      ...conditions[0],
      connector: 'AND',
      conditions: conditions.slice(1)
    };
  }
}
