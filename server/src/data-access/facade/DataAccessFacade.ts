/**
 * DataAccessFacade - Unified entry point for all data operations
 * 
 * Routes requests to appropriate backend based on data source type.
 * Replaces the old DataAccessorFactory pattern.
 */

import type { NativeData } from '../../core';
import type { FilterCondition, BufferOptions } from '../interfaces';
import type { DataBackend, DistanceResult, NearestNeighborResult } from '../backends/DataBackend';
import { VectorBackend } from '../backends/vector';
import { RasterBackend } from '../backends/raster';
import { PostGISBackend } from '../backends/postgis';
import type { PostGISConnectionConfig } from '../../core';

export interface VisualizationOptions {
  valueField?: string;
  categoryField?: string;
  classification?: string;
  numClasses?: number;
  colorRamp?: string;
  colorPalette?: string;
  opacity?: number;
  radius?: number;
  cellSize?: number;
  weightField?: string;
  outputFormat?: string;
  strokeWidth?: number;
  color?: string;
}

export class DataAccessFacade {
  private static instance: DataAccessFacade;
  
  private vectorBackend: VectorBackend;
  private rasterBackend: RasterBackend;
  private postGISBackend: PostGISBackend | null = null;
  
  private backends: DataBackend[] = [];
  
  private constructor(workspaceBase?: string, postGISConfig?: PostGISConnectionConfig) {
    this.vectorBackend = new VectorBackend(workspaceBase);
    this.rasterBackend = new RasterBackend();
    
    if (postGISConfig) {
      this.postGISBackend = new PostGISBackend(postGISConfig);
    }
    
    // Register all backends
    this.backends = [
      this.vectorBackend,
      this.rasterBackend
    ];
    
    if (this.postGISBackend) {
      this.backends.push(this.postGISBackend);
    }
  }
  
  static getInstance(workspaceBase?: string, postGISConfig?: PostGISConnectionConfig): DataAccessFacade {
    if (!DataAccessFacade.instance) {
      DataAccessFacade.instance = new DataAccessFacade(workspaceBase, postGISConfig);
    }
    return DataAccessFacade.instance;
  }
  
  /**
   * Dynamically configure or reconfigure PostGIS backend
   * Useful for testing connections or switching databases
   */
  configurePostGIS(config: PostGISConnectionConfig): void {
    this.postGISBackend = new PostGISBackend(config);
    
    // Rebuild backends list
    this.backends = [
      this.vectorBackend,
      this.rasterBackend,
      this.postGISBackend
    ];
  }
  
  /**
   * Get PostGIS backend instance for direct operations
   * Returns null if PostGIS is not configured
   */
  getPostGISBackend(): PostGISBackend | null {
    return this.postGISBackend;
  }
  
  /**
   * Get appropriate backend for the given data source
   */
  private getBackend(dataSourceType: string, reference: string): DataBackend {
    for (const backend of this.backends) {
      if (backend.canHandle(dataSourceType, reference)) {
        return backend;
      }
    }
    
    throw new Error(`No backend found for data source type: ${dataSourceType}`);
  }
  
  // ========== Spatial Operations ==========
  
  async buffer(
    dataSourceType: string,
    reference: string,
    distance: number,
    options?: BufferOptions
  ): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.buffer(reference, distance, options);
  }
  
  async overlay(
    dataSourceType: string,
    reference1: string,
    reference2: string,
    operation: 'intersect' | 'union' | 'difference' | 'symmetric_difference'
  ): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, reference1);
    return backend.overlay(reference1, reference2, operation);
  }
  
  async filter(
    dataSourceType: string,
    reference: string,
    filterCondition: FilterCondition
  ): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.filter(reference, filterCondition);
  }
  
  async aggregate(
    dataSourceType: string,
    reference: string,
    aggFunc: string,
    field: string,
    returnFeature?: boolean
  ): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.aggregate(reference, aggFunc, field, returnFeature);
  }
  
  async spatialJoin(
    dataSourceType: string,
    targetReference: string,
    joinReference: string,
    operation: string,
    joinType?: string
  ): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, targetReference);
    return backend.spatialJoin(targetReference, joinReference, operation, joinType);
  }
  
  // ========== Visualization Operations ==========
  
  async choropleth(
    dataSourceType: string,
    reference: string,
    valueField: string,
    options?: VisualizationOptions
  ): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.choropleth(reference, valueField, options as any);
  }
  
  async heatmap(
    dataSourceType: string,
    reference: string,
    options?: VisualizationOptions
  ): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.heatmap(reference, options);
  }
  
  async categorical(
    dataSourceType: string,
    reference: string,
    categoryField: string,
    options?: VisualizationOptions
  ): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.categorical(reference, categoryField, options);
  }
  
  async uniformColor(
    dataSourceType: string,
    reference: string,
    options?: VisualizationOptions
  ): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.uniformColor(reference, options);
  }
  
  // ========== CRUD Operations ==========
  
  async read(dataSourceType: string, reference: string): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.read(reference);
  }
  
  async write(dataSourceType: string, data: any, metadata?: any): Promise<string> {
    const backend = this.getBackend(dataSourceType, '');
    return backend.write(data, metadata);
  }
  
  async delete(dataSourceType: string, reference: string): Promise<void> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.delete(reference);
  }
  
  async getMetadata(dataSourceType: string, reference: string): Promise<any> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.getMetadata(reference);
  }
  
  async validate(dataSourceType: string, reference: string): Promise<boolean> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.validate(reference);
  }
  
  /**
   * Get schema information for a data source
   * For PostGIS: queries database metadata
   * For file-based: returns cached metadata from registration
   */
  async getSchema(
    dataSourceType: string,
    reference: string,
    tableName?: string
  ): Promise<any> {
    const backend = this.getBackend(dataSourceType, reference);
    
    // For PostGIS, use the table name if provided, otherwise use reference
    const targetTable = tableName || reference;
    return backend.getSchema(targetTable);
  }
  
  // ========== Statistical Operations ==========
  
  /**
   * Get unique values for a field (for categorical rendering)
   */
  async getUniqueValues(
    dataSourceType: string,
    reference: string,
    fieldName: string
  ): Promise<string[]> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.getUniqueValues(reference, fieldName);
  }
  
  /**
   * Get comprehensive field statistics
   */
  async getFieldStatistics(
    dataSourceType: string,
    reference: string,
    fieldName: string
  ): Promise<any> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.getFieldStatistics(reference, fieldName);
  }
  
  /**
   * Calculate classification breaks for choropleth mapping
   */
  async getClassificationBreaks(
    dataSourceType: string,
    reference: string,
    fieldName: string,
    method: 'quantile' | 'equal_interval' | 'jenks' | 'standard_deviation',
    numClasses?: number
  ): Promise<number[]> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.getClassificationBreaks(reference, fieldName, method, numClasses);
  }
  
  // ========== Proximity Operations ==========
  
  /**
   * Calculate distance between features in two datasets
   */
  async calculateDistance(
    dataSourceType: string,
    reference1: string,
    reference2: string,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
      maxPairs?: number;
    }
  ): Promise<DistanceResult[]> {
    const backend = this.getBackend(dataSourceType, reference1);
    return backend.calculateDistance(reference1, reference2, options);
  }
  
  /**
   * Find nearest neighbors using KNN or brute force
   */
  async findNearestNeighbors(
    dataSourceType: string,
    sourceReference: string,
    targetReference: string,
    limit: number,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
    }
  ): Promise<NearestNeighborResult[]> {
    const backend = this.getBackend(dataSourceType, sourceReference);
    return backend.findNearestNeighbors(sourceReference, targetReference, limit, options);
  }
  
  /**
   * Filter features within a distance threshold
   */
  async filterByDistance(
    dataSourceType: string,
    reference: string,
    centerReference: string,
    distance: number,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
    }
  ): Promise<NativeData> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.filterByDistance(reference, centerReference, distance, options);
  }
  
  // ========== Spatial Metric Operations ==========
  
  /**
   * Calculate area statistics for polygon features
   */
  async calculateAreaStats(
    dataSourceType: string,
    reference: string,
    options?: {
      unit?: 'square_meters' | 'square_kilometers' | 'hectares';
    }
  ): Promise<{ min: number; max: number; mean: number; sum: number; count: number }> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.calculateAreaStats(reference, options);
  }
  
  /**
   * Calculate perimeter/length statistics for polygon or line features
   */
  async calculatePerimeterStats(
    dataSourceType: string,
    reference: string,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles';
    }
  ): Promise<{ min: number; max: number; mean: number; sum: number; count: number }> {
    const backend = this.getBackend(dataSourceType, reference);
    return backend.calculatePerimeterStats(reference, options);
  }
}
