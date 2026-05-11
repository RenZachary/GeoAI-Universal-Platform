/**
 * ProximityOperator - Calculate distances and find nearest features
 * 
 * Supports three proximity operations:
 * 1. distance_matrix: Calculate pairwise distances between two datasets
 * 2. nearest_neighbor: Find k-nearest neighbors for each source feature
 * 3. within_distance: Filter target features within specified distance of source
 * 
 * Leverages backend implementations (VectorBackend with Turf.js or PostGISBackend with SQL)
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, AnalyticalOutputSchema } from '../../SpatialOperator';
import { DataSourceRepository } from '../../../data-access';
import { DataAccessFacade } from '../../../data-access/facade/DataAccessFacade';
import type Database from 'better-sqlite3';
import type { DistanceResult, NearestNeighborResult } from '../../../data-access/backends/DataBackend';

// ========== Input Schema ==========

const ProximityOperationType = z.enum(['distance_matrix', 'nearest_neighbor', 'within_distance']);
const DistanceUnit = z.enum(['meters', 'kilometers', 'feet', 'miles', 'degrees']).default('meters');

export const ProximityInputSchema = z.object({
  operation: ProximityOperationType.describe('Type of proximity analysis to perform'),
  
  // Source dataset (required for all operations)
  sourceDataSourceId: z.string().describe('ID of the source data source'),
  
  // Target dataset (required for distance_matrix and nearest_neighbor)
  targetDataSourceId: z.string().optional().describe('ID of the target data source (required for distance_matrix and nearest_neighbor)'),
  
  // Operation-specific parameters
  limit: z.number().min(1).max(100).optional().describe('Number of nearest neighbors to find (for nearest_neighbor operation, default: 5)'),
  distance: z.number().positive().optional().describe('Maximum distance threshold (for within_distance operation, required)'),
  unit: DistanceUnit.describe('Distance unit (default: meters)'),
  maxPairs: z.number().positive().optional().describe('Maximum number of pairs to calculate (safety limit for large datasets, default: 10000)'),
});

// ========== Output Schema ==========

export const ProximityOutputSchema = AnalyticalOutputSchema.extend({
  data: z.object({
    operation: ProximityOperationType,
    results: z.array(z.any()).describe('Proximity calculation results'),
    count: z.number().describe('Number of results'),
    unit: DistanceUnit,
    summary: z.string().optional().describe('Human-readable summary')
  })
});

// ========== Operator Implementation ==========

export class ProximityOperator extends SpatialOperator {
  readonly operatorId = 'proximity';
  readonly name = 'Proximity Analysis';
  readonly description = 'Calculate distances between features, find nearest neighbors, or filter by distance threshold. Supports both vector files and PostGIS tables.';
  readonly category = 'analysis' as const;
  readonly returnType = 'analytical' as const;
  readonly inputSchema = ProximityInputSchema;
  readonly outputSchema = ProximityOutputSchema;

  private db?: Database.Database;

  constructor(db?: Database.Database) {
    super();
    this.db = db;
  }

  protected async executeCore(
    params: z.infer<typeof ProximityInputSchema>,
    _context: OperatorContext
  ): Promise<z.infer<typeof ProximityOutputSchema>> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    // Initialize services
    const dataSourceRepo = new DataSourceRepository(this.db);
    const dataAccess = DataAccessFacade.getInstance();

    // Validate data sources exist
    const sourceDS = dataSourceRepo.getById(params.sourceDataSourceId);
    if (!sourceDS) {
      throw new Error(`Source data source not found: ${params.sourceDataSourceId}`);
    }

    let results: Array<DistanceResult | NearestNeighborResult | { targetId: string | number; withinDistance: boolean; distance: number; unit: string }>;
    let summary: string;

    switch (params.operation) {
      case 'distance_matrix': {
        if (!params.targetDataSourceId) {
          throw new Error('targetDataSourceId is required for distance_matrix operation');
        }
        
        const targetDS = dataSourceRepo.getById(params.targetDataSourceId);
        if (!targetDS) {
          throw new Error(`Target data source not found: ${params.targetDataSourceId}`);
        }

        // Performance warning for large datasets
        if (sourceDS.type === 'geojson' || sourceDS.type === 'shapefile') {
          const sourceMetadata = await dataAccess.getMetadata(sourceDS.type, sourceDS.reference);
          const targetMetadata = await dataAccess.getMetadata(targetDS.type, targetDS.reference);
          const sourceCount = sourceMetadata?.featureCount || 0;
          const targetCount = targetMetadata?.featureCount || 0;
          
          if (sourceCount * targetCount > (params.maxPairs || 10000)) {
            console.warn(
              `[ProximityOperator] Large dataset: ${sourceCount} × ${targetCount} = ${sourceCount * targetCount} pairs. ` +
              `Consider using maxPairs parameter or switching to PostGIS.`
            );
          }
        }

        results = await dataAccess.calculateDistance(
          sourceDS.type,
          sourceDS.reference,
          targetDS.reference,
          {
            unit: params.unit,
            maxPairs: params.maxPairs
          }
        );

        summary = `Calculated ${results.length} pairwise distances between ${sourceDS.name} and ${targetDS.name}`;
        break;
      }

      case 'nearest_neighbor': {
        if (!params.targetDataSourceId) {
          throw new Error('targetDataSourceId is required for nearest_neighbor operation');
        }

        const targetDS = dataSourceRepo.getById(params.targetDataSourceId);
        if (!targetDS) {
          throw new Error(`Target data source not found: ${params.targetDataSourceId}`);
        }

        const limit = params.limit || 5;

        results = await dataAccess.findNearestNeighbors(
          sourceDS.type,
          sourceDS.reference,
          targetDS.reference,
          limit,
          { unit: params.unit }
        );

        summary = `Found ${limit} nearest neighbors for each of ${results.length / limit} source features in ${sourceDS.name}`;
        break;
      }

      case 'within_distance': {
        if (params.distance === undefined) {
          throw new Error('distance parameter is required for within_distance operation');
        }

        if (!params.targetDataSourceId) {
          throw new Error('targetDataSourceId is required for within_distance operation');
        }

        const targetDS = dataSourceRepo.getById(params.targetDataSourceId);
        if (!targetDS) {
          throw new Error(`Target data source not found: ${params.targetDataSourceId}`);
        }

        const filteredData = await dataAccess.filterByDistance(
          targetDS.type,
          targetDS.reference,
          sourceDS.reference,
          params.distance,
          { unit: params.unit }
        );

        // Convert NativeData to result format
        const featureIds = filteredData.metadata?.featureIds || [];
        results = featureIds.map((id: string | number) => ({
          targetId: id,
          withinDistance: true,
          distance: params.distance,
          unit: params.unit
        }));

        summary = `Found ${results.length} features in ${targetDS.name} within ${params.distance} ${params.unit} of ${sourceDS.name}`;
        break;
      }

      default:
        throw new Error(`Unsupported proximity operation: ${params.operation}`);
    }

    return {
      success: true,
      data: {
        operation: params.operation,
        results: results,
        count: results.length,
        unit: params.unit,
        summary
      },
      metadata: {
        operatorId: this.operatorId,
        executedAt: new Date().toISOString(),
        summary
      }
    };
  }
}
