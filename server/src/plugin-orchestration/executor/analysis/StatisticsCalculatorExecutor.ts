/**
 * Statistics Calculator Plugin Executor
 * Calculates comprehensive statistical summaries for spatial data attributes
 */

import type { NativeData } from '../../../core/index';
import { DataAccessorFactory } from '../../../data-access/factories/DataAccessorFactory';
import { DataSourceRepository } from '../../../data-access/repositories';
import type Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StatisticsCalculatorParams {
  dataSourceId: string;
  fieldName: string;
  statistics?: Array<'mean' | 'median' | 'std_dev' | 'variance' | 'min' | 'max' | 'sum' | 'count'>;
}

interface StatisticalResult {
  count: number;
  sum: number;
  mean: number;
  median: number;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  q1: number;  // First quartile
  q3: number;  // Third quartile
  iqr: number; // Interquartile range
}

export class StatisticsCalculatorExecutor {
  private db: Database.Database;
  private dataSourceRepo: DataSourceRepository;
  private accessorFactory: DataAccessorFactory;

  constructor(db: Database.Database, workspaceBase?: string) {
    this.db = db;
    this.dataSourceRepo = new DataSourceRepository(db);
    this.accessorFactory = new DataAccessorFactory(workspaceBase);
  }

  async execute(params: StatisticsCalculatorParams): Promise<NativeData> {
    console.log('[StatisticsCalculatorExecutor] Calculating statistics...');
    console.log('[StatisticsCalculatorExecutor] Params:', params);

    try {
      // Step 1: Query database for data source metadata
      const dataSource = this.dataSourceRepo.getById(params.dataSourceId);
      
      if (!dataSource) {
        throw new Error(`Data source not found: ${params.dataSourceId}`);
      }

      console.log('[StatisticsCalculatorExecutor] Found data source:', {
        id: dataSource.id,
        name: dataSource.name,
        type: dataSource.type,
        reference: dataSource.reference
      });

      // Step 2: Create appropriate accessor
      const accessor = this.accessorFactory.createAccessor(dataSource.type);
      console.log('[StatisticsCalculatorExecutor] Created accessor for type:', dataSource.type);

      // Step 3: Extract numeric values using accessor's filter/read capabilities
      const values = await this.extractFieldValues(accessor, dataSource.reference, params.fieldName);
      
      if (values.length === 0) {
        throw new Error(`No valid numeric values found for field '${params.fieldName}'`);
      }

      console.log(`[StatisticsCalculatorExecutor] Extracted ${values.length} values`);

      // Step 4: Calculate requested statistics
      const statsToCalculate = params.statistics || ['mean', 'median', 'std_dev', 'min', 'max'];
      const statistics = this.calculateStatistics(values, statsToCalculate);

      console.log('[StatisticsCalculatorExecutor] Statistics calculated:', statistics);

      // Step 5: Generate stats ID and save result as GeoJSON file
      const statsId = `stats_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      
      const workspaceBase = (this.accessorFactory as any).workspaceBase || path.join(__dirname, '..', '..', '..', '..', 'workspace');
      const statsDir = path.join(workspaceBase, 'results', 'geojson');
      if (!fs.existsSync(statsDir)) {
        fs.mkdirSync(statsDir, { recursive: true });
      }

      const statsFilename = `${statsId}.geojson`;
      const statsPath = path.join(statsDir, statsFilename);
      
      // Create a simple GeoJSON Feature with statistics in properties
      const statsGeoJSON = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: null,
          properties: {
            pluginId: 'statistics_calculator',
            dataSourceId: params.dataSourceId,
            fieldName: params.fieldName,
            valueCount: values.length,
            ...statistics,
            summary: this.generateSummary(statistics, params.fieldName),
            calculatedAt: new Date().toISOString()
          }
        }]
      };
      
      fs.writeFileSync(statsPath, JSON.stringify(statsGeoJSON, null, 2), 'utf-8');
      console.log(`[StatisticsCalculatorExecutor] Statistics saved to: ${statsPath}`);

      // Step 6: Generate result metadata
      return {
        id: statsId,
        type: 'geojson',
        reference: `/api/results/geojson/${statsFilename}`,
        metadata: {
          pluginId: 'statistics_calculator',
          dataSourceId: params.dataSourceId,
          fieldName: params.fieldName,
          valueCount: values.length,
          statisticsRequested: statsToCalculate,
          statistics: statistics,
          calculatedAt: new Date(),
          summary: this.generateSummary(statistics, params.fieldName)
        },
        createdAt: new Date()
      };

    } catch (error) {
      console.error('[StatisticsCalculatorExecutor] Statistics calculation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const wrappedError = new Error(`Statistics calculation failed: ${errorMessage}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }

  /**
   * Extract numeric values from a field using the data accessor
   */
  private async extractFieldValues(
    accessor: any,
    reference: string,
    fieldName: string
  ): Promise<number[]> {
    console.log('[StatisticsCalculatorExecutor] Loading data from:', reference);
    
    // Check if accessor has loadGeoJSON method (GeoJSON-based accessors)
    // This includes GeoJSONAccessor, ShapefileAccessor, etc.
    if (typeof accessor.loadGeoJSON === 'function') {
      console.log('[StatisticsCalculatorExecutor] Using loadGeoJSON method');
      const geojson = await accessor.loadGeoJSON(reference);
      return this.extractFromGeoJSON(geojson, fieldName);
    }
    
    // For PostGIS and other database accessors, use different approach
    if (accessor.type === 'postgis') {
      console.log('[StatisticsCalculatorExecutor] PostGIS accessor detected');
      // TODO: Implement PostGIS field extraction using SQL queries
      throw new Error('PostGIS field extraction not yet implemented');
    }
    
    // For other accessor types
    throw new Error(`Field extraction not yet implemented for accessor type: ${accessor.type}`);
  }

  /**
   * Extract numeric field values from GeoJSON FeatureCollection
   */
  private extractFromGeoJSON(geojson: any, fieldName: string): number[] {
    const values: number[] = [];
    
    for (const feature of geojson.features) {
      if (feature.properties && fieldName in feature.properties) {
        const value = Number(feature.properties[fieldName]);
        if (!isNaN(value) && isFinite(value)) {
          values.push(value);
        }
      }
    }
    
    return values;
  }

  /**
   * Calculate comprehensive statistics
   */
  private calculateStatistics(
    values: number[],
    requestedStats: Array<'mean' | 'median' | 'std_dev' | 'variance' | 'min' | 'max' | 'sum' | 'count'>
  ): StatisticalResult {
    // Sort values for median and quartile calculations
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    // Basic statistics (always calculated)
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const count = n;
    const mean = sum / n;
    const min = sorted[0];
    const max = sorted[n - 1];
    const range = max - min;

    // Median calculation
    const median = this.calculateMedian(sorted);

    // Variance and standard deviation
    const variance = this.calculateVariance(sorted, mean);
    const stdDev = Math.sqrt(variance);

    // Quartiles
    const q1 = this.calculatePercentile(sorted, 25);
    const q3 = this.calculatePercentile(sorted, 75);
    const iqr = q3 - q1;

    return {
      count,
      sum,
      mean,
      median,
      stdDev,
      variance,
      min,
      max,
      range,
      q1,
      q3,
      iqr
    };
  }

  /**
   * Calculate median value
   */
  private calculateMedian(sorted: number[]): number {
    const n = sorted.length;
    const mid = Math.floor(n / 2);
    
    if (n % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[], mean: number): number {
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((acc, diff) => acc + diff, 0) / values.length;
  }

  /**
   * Calculate percentile using linear interpolation
   */
  private calculatePercentile(sorted: number[], percentile: number): number {
    const n = sorted.length;
    const index = (percentile / 100) * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    if (lower === upper) {
      return sorted[lower];
    }
    
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Generate human-readable summary of statistics
   */
  private generateSummary(stats: StatisticalResult, fieldName: string): string {
    return [
      `Statistics for '${fieldName}':`,
      `  Count: ${stats.count.toLocaleString()} values`,
      `  Mean: ${stats.mean.toFixed(2)} ± ${stats.stdDev.toFixed(2)}`,
      `  Median: ${stats.median.toFixed(2)}`,
      `  Range: ${stats.min.toFixed(2)} to ${stats.max.toFixed(2)} (${stats.range.toFixed(2)})`,
      `  Quartiles: Q1=${stats.q1.toFixed(2)}, Q3=${stats.q3.toFixed(2)}, IQR=${stats.iqr.toFixed(2)}`,
      `  Sum: ${stats.sum.toFixed(2)}`
    ].join('\n');
  }
}
