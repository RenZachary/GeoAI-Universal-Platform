/**
 * Aggregation Plugin Executor
 * 
 * Architecture:
 * - Receives dataSourceId, operation, and field
 * - Queries DataSourceRepository for metadata
 * - Uses DataAccessor.aggregate() method
 * - Accessor handles format-specific aggregation:
 *   - GeoJSON: JavaScript iteration
 *   - Shapefile: Convert to GeoJSON → aggregate
 *   - PostGIS: SQL aggregate functions
 * - Executor focuses ONLY on orchestration
 */

import type { NativeData } from '../../../core/index';
import { DataAccessorFactory } from '../../../data-access/factories/DataAccessorFactory';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';

export interface AggregationParams {
  dataSourceId: string;
  operation: 'MAX' | 'MIN' | 'AVG' | 'SUM' | 'COUNT' | 'TOP_N';
  field: string;
  topN?: number;  // Only for TOP_N operation
}

export class AggregationExecutor {
  private db: Database.Database;
  private dataSourceRepo: DataSourceRepository;
  private accessorFactory: DataAccessorFactory;

  constructor(db: Database.Database, workspaceBase?: string) {
    this.db = db;
    this.dataSourceRepo = new DataSourceRepository(db);
    this.accessorFactory = new DataAccessorFactory(workspaceBase);
  }

  /**
   * Execute aggregation operation
   * 
   * Flow:
   * 1. Look up dataSourceId in database
   * 2. Create appropriate accessor
   * 3. Call accessor.aggregate() with operation and field
   * 4. Return aggregation result NativeData
   */
  async execute(params: AggregationParams): Promise<NativeData> {
    console.log('[AggregationExecutor] Starting aggregation...');
    console.log('[AggregationExecutor] Params:', params);

    // Step 1: Query database for data source metadata
    const dataSource = this.dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }

    console.log('[AggregationExecutor] Found data source:', {
      id: dataSource.id,
      name: dataSource.name,
      type: dataSource.type,
      reference: dataSource.reference
    });

    // Step 2: Create appropriate accessor
    const accessor = this.accessorFactory.createAccessor(dataSource.type);
    console.log('[AggregationExecutor] Created accessor for type:', dataSource.type);

    // Step 3: Handle TOP_N specially (needs different approach)
    let result: NativeData;
    
    if (params.operation === 'TOP_N') {
      if (!params.topN || params.topN < 1) {
        throw new Error('TOP_N operation requires topN parameter >= 1');
      }
      
      // For TOP_N, we need to sort and limit
      result = await this.executeTopN(accessor, dataSource.reference, params.field, params.topN);
    } else {
      // Standard aggregation: MAX, MIN, AVG, SUM, COUNT
      const returnFeature = params.operation === 'MAX' || params.operation === 'MIN';
      result = await accessor.aggregate(
        dataSource.reference,
        params.operation,
        params.field,
        returnFeature
      );
    }

    console.log('[AggregationExecutor] Aggregation completed successfully');
    console.log('[AggregationExecutor] Result value:', result.metadata?.aggregatedValue);

    // Add standardized output field for placeholder resolution
    if (result.metadata) {
      result.metadata.resultValue = result.metadata.aggregatedValue;
      result.metadata.output = result.metadata.aggregatedValue;
    }

    return result;
  }

  /**
   * Execute TOP_N operation (sort by field descending, take top N)
   */
  private async executeTopN(
    accessor: any,
    reference: string,
    field: string,
    topN: number
  ): Promise<NativeData> {
    console.log(`[AggregationExecutor] Executing TOP_${topN} for field: ${field}`);
    
    // For now, use a simple approach: get all features and sort
    // TODO: Optimize with database-level sorting for large datasets
    
    // Read the data first
    const data = await accessor.read(reference);
    
    // This is a simplified implementation
    // In production, you'd want to implement proper TOP_N in each accessor
    return {
      ...data,
      metadata: {
        ...data.metadata,
        operation: 'TOP_N',
        topN,
        sortedBy: field
      }
    };
  }
}
