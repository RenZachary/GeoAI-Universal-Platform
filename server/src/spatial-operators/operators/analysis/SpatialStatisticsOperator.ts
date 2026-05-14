/**
 * SpatialStatisticsOperator - Calculates spatial metric statistics
 * 
 * Provides statistical summaries for spatial measurements including:
 * - Area (for polygon features)
 * - Perimeter/Length (for line and polygon features)
 * - Feature count by geometry type
 * 
 * Works with both file-based (GeoJSON/Shapefile) and PostGIS data sources.
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext, AnalyticalOutputSchema } from '../../SpatialOperator';
import { DataAccessFacade } from '../../../data-access';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';

// ========== Input Schema ==========

const SpatialMetricType = z.enum([
  'area',
  'perimeter',
  'length',
  'feature_count'
]);

export const SpatialStatisticsInputSchema = z.object({
  dataSourceId: z.string().describe('ID of the data source to analyze'),
  metrics: z.array(SpatialMetricType)
    .default(['area', 'perimeter'])
    .describe('List of spatial metrics to calculate'),
  unit: z.enum(['square_meters', 'square_kilometers', 'hectares', 'meters', 'kilometers'])
    .default('square_meters')
    .optional()
    .describe('Unit for area/perimeter measurements (default: square_meters)')
});

// ========== Output Schema ==========

export const SpatialStatisticsOutputSchema = AnalyticalOutputSchema.extend({
  data: z.object({
    metrics: z.record(z.string(), z.object({
      mean: z.number().optional().describe('Mean value'),
      min: z.number().optional().describe('Minimum value'),
      max: z.number().optional().describe('Maximum value'),
      sum: z.number().optional().describe('Sum of all values'),
      count: z.number().describe('Number of features with this metric')
    })).describe('Calculated spatial metrics'),
    totalFeatureCount: z.number().describe('Total number of features in dataset'),
    geometryType: z.string().describe('Primary geometry type of the dataset'),
    dataSourceId: z.string().describe('Source data source ID')
  })
});

// ========== Operator Implementation ==========

export class SpatialStatisticsOperator extends SpatialOperator {
  readonly operatorId = 'spatial_statistics';
  readonly name = 'Spatial Statistics Calculator';
  readonly description = 'Calculate statistical summaries for spatial measurements (area, perimeter, length) of vector features. Supports polygons for area/perimeter and lines for length. ';
  readonly category = 'analysis' as const;
  readonly returnType = 'analytical' as const; // Returns statistics, not spatial data
  
  readonly inputSchema = SpatialStatisticsInputSchema;
  readonly outputSchema = SpatialStatisticsOutputSchema;
  
  private db?: Database.Database;
  private workspaceBase?: string;
  
  constructor(db?: Database.Database, workspaceBase?: string) {
    super();
    this.db = db;
    this.workspaceBase = workspaceBase;
  }
  
  protected async executeCore(
    params: z.infer<typeof SpatialStatisticsInputSchema>,
    _context: OperatorContext
  ): Promise<z.infer<typeof SpatialStatisticsOutputSchema>> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }
    
    const dataSourceRepo = new DataSourceRepository(this.db);
    const dataAccess = DataAccessFacade.getInstance(this.workspaceBase);
    
    const dataSource = dataSourceRepo.getById(params.dataSourceId);
    
    if (!dataSource) {
      throw new Error(`Data source not found: ${params.dataSourceId}`);
    }
    
    // Get metadata to understand geometry type
    const metadata = await dataAccess.getMetadata(dataSource.type, dataSource.reference);
    const geometryType = metadata?.geometryType || 'Unknown';
    const totalFeatureCount = metadata?.featureCount || 0;
    
    // Calculate each requested metric
    const metrics: Record<string, any> = {};
    
    for (const metric of params.metrics) {
      try {
        switch (metric) {
          case 'area':
            if (geometryType.includes('Polygon')) {
              metrics.area = await this.calculateAreaStats(dataAccess, dataSource, params.unit || 'square_meters');
            } else {
              console.warn(`[SpatialStatisticsOperator] Area calculation requires polygon geometry, got: ${geometryType}`);
              metrics.area = { count: 0 };
            }
            break;
            
          case 'perimeter':
            if (geometryType.includes('Polygon') || geometryType.includes('Line')) {
              metrics.perimeter = await this.calculatePerimeterStats(dataAccess, dataSource, params.unit || 'meters');
            } else {
              console.warn(`[SpatialStatisticsOperator] Perimeter calculation requires polygon or line geometry, got: ${geometryType}`);
              metrics.perimeter = { count: 0 };
            }
            break;
            
          case 'length':
            if (geometryType.includes('Line')) {
              metrics.length = await this.calculateLengthStats(dataAccess, dataSource, params.unit || 'meters');
            } else {
              console.warn(`[SpatialStatisticsOperator] Length calculation requires line geometry, got: ${geometryType}`);
              metrics.length = { count: 0 };
            }
            break;
            
          case 'feature_count':
            metrics.feature_count = {
              count: totalFeatureCount,
              mean: totalFeatureCount,
              min: totalFeatureCount,
              max: totalFeatureCount,
              sum: totalFeatureCount
            };
            break;
        }
      } catch (error) {
        console.warn(`[SpatialStatisticsOperator] Failed to calculate ${metric}:`, error);
        metrics[metric] = { count: 0 };
      }
    }
    
    return {
      success: true,
      data: {
        metrics,
        totalFeatureCount,
        geometryType,
        dataSourceId: params.dataSourceId
      },
      metadata: {
        operatorId: this.operatorId,
        executedAt: new Date().toISOString(),
        summary: `Calculated ${params.metrics.length} spatial metrics for ${totalFeatureCount} ${geometryType} features`
      }
    };
  }
  
  /**
   * Calculate area statistics for polygon features
   */
  private async calculateAreaStats(
    dataAccess: DataAccessFacade,
    dataSource: any,
    unit: string
  ): Promise<any> {
    try {
      const areaUnit = unit as 'square_meters' | 'square_kilometers' | 'hectares';
      const result = await dataAccess.calculateAreaStats(dataSource.type, dataSource.reference, { unit: areaUnit });
      return result;
    } catch (error) {
      console.error('[SpatialStatisticsOperator] Failed to calculate area stats:', error);
      return { min: 0, max: 0, mean: 0, sum: 0, count: 0 };
    }
  }
  
  /**
   * Calculate perimeter statistics for polygon/line features
   */
  private async calculatePerimeterStats(
    dataAccess: DataAccessFacade,
    dataSource: any,
    unit: string
  ): Promise<any> {
    try {
      const lengthUnit = unit as 'meters' | 'kilometers' | 'feet' | 'miles';
      const result = await dataAccess.calculatePerimeterStats(dataSource.type, dataSource.reference, { unit: lengthUnit });
      return result;
    } catch (error) {
      console.error('[SpatialStatisticsOperator] Failed to calculate perimeter stats:', error);
      return { min: 0, max: 0, mean: 0, sum: 0, count: 0 };
    }
  }
  
  /**
   * Calculate length statistics for line features (alias for perimeter)
   */
  private async calculateLengthStats(
    dataAccess: DataAccessFacade,
    dataSource: any,
    unit: string
  ): Promise<any> {
    // Length is calculated the same way as perimeter for lines
    return this.calculatePerimeterStats(dataAccess, dataSource, unit);
  }
}
