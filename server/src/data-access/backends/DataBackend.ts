/**
 * DataBackend - Unified abstraction for data operations
 * 
 * Replaces the format-specific Accessor pattern with capability-based Backends.
 * Each Backend handles a specific data type (Vector, Raster, Database).
 */

import type { NativeData, DataSourceType } from '../../core';
import type { FilterCondition, BufferOptions, OverlayOptions } from '../interfaces';

/**
 * Base interface for all data backends
 */
export interface DataBackend {
  /** Backend type identifier */
  readonly backendType: 'vector' | 'raster' | 'postgis';
  
  /** Check if backend can handle the given data source */
  canHandle(dataSourceType: string, reference: string): boolean;
  
  // ========== Core Spatial Operations ==========
  
  /**
   * Buffer operation - Create buffer zones around features
   */
  buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData>;
  
  /**
   * Overlay operation - Spatial overlay between two datasets
   */
  overlay(
    reference1: string,
    reference2: string,
    operation: 'intersect' | 'union' | 'difference' | 'symmetric_difference'
  ): Promise<NativeData>;
  
  /**
   * Filter operation - Filter features based on conditions
   */
  filter(reference: string, filterCondition: FilterCondition): Promise<NativeData>;
  
  /**
   * Aggregate operation - Statistical aggregation (MAX, MIN, AVG, SUM, COUNT)
   */
  aggregate(
    reference: string,
    aggFunc: string,
    field: string,
    returnFeature?: boolean
  ): Promise<NativeData>;
  
  /**
   * Spatial join - Join two datasets based on spatial relationship
   */
  spatialJoin(
    targetReference: string,
    joinReference: string,
    operation: string,
    joinType?: string
  ): Promise<NativeData>;
  
  // ========== Visualization Operations ==========
  
  /**
   * Choropleth visualization - Thematic mapping with classified colors
   */
  choropleth(
    reference: string,
    valueField: string,
    options?: {
      classification?: 'quantile' | 'equal_interval' | 'jenks' | 'standard_deviation';
      numClasses?: number;
      colorRamp?: string;
    }
  ): Promise<NativeData>;
  
  /**
   * Heatmap visualization - Density-based heatmap rendering
   */
  heatmap(
    reference: string,
    options?: {
      radius?: number;
      cellSize?: number;
      weightField?: string;
      colorRamp?: string;
    }
  ): Promise<NativeData>;
  
  /**
   * Categorical visualization - Unique value rendering
   */
  categorical(
    reference: string,
    categoryField: string,
    options?: {
      colorPalette?: string;
    }
  ): Promise<NativeData>;
  
  /**
   * Uniform color visualization - Single color rendering
   */
  uniformColor(
    reference: string,
    options?: {
      color?: string;
      opacity?: number;
      strokeWidth?: number;
    }
  ): Promise<NativeData>;
  
  // ========== Basic CRUD Operations ==========
  
  /**
   * Read data from source
   */
  read(reference: string): Promise<NativeData>;
  
  /**
   * Write data to destination
   */
  write(data: any, metadata?: any): Promise<string>;
  
  /**
   * Delete data by reference
   */
  delete(reference: string): Promise<void>;
  
  /**
   * Get metadata for existing data
   */
  getMetadata(reference: string): Promise<any>;
  
  /**
   * Validate data format integrity
   */
  validate(reference: string): Promise<boolean>;
  
  /**
   * Get schema information for a data source
   * Returns column/field metadata including types, constraints, etc.
   */
  getSchema(reference: string): Promise<any>;
}

/**
 * Abstract base class providing common functionality
 */
export abstract class BaseBackend implements DataBackend {
  abstract readonly backendType: 'vector' | 'raster' | 'postgis';
  
  abstract canHandle(dataSourceType: string, reference: string): boolean;
  
  // Provide default implementations that throw "not supported" errors
  // Subclasses override only the methods they support
  
  async buffer(_reference: string, _distance: number, _options?: BufferOptions): Promise<NativeData> {
    throw new Error(`Buffer operation not supported by ${this.backendType} backend`);
  }
  
  async overlay(
    _reference1: string,
    _reference2: string,
    _operation: 'intersect' | 'union' | 'difference' | 'symmetric_difference'
  ): Promise<NativeData> {
    throw new Error(`Overlay operation not supported by ${this.backendType} backend`);
  }
  
  async filter(_reference: string, _filterCondition: FilterCondition): Promise<NativeData> {
    throw new Error(`Filter operation not supported by ${this.backendType} backend`);
  }
  
  async aggregate(
    _reference: string,
    _aggFunc: string,
    _field: string,
    _returnFeature?: boolean
  ): Promise<NativeData> {
    throw new Error(`Aggregate operation not supported by ${this.backendType} backend`);
  }
  
  async spatialJoin(
    _targetReference: string,
    _joinReference: string,
    _operation: string,
    _joinType?: string
  ): Promise<NativeData> {
    throw new Error(`Spatial join operation not supported by ${this.backendType} backend`);
  }
  
  async choropleth(
    _reference: string,
    _valueField: string,
    _options?: any
  ): Promise<NativeData> {
    throw new Error(`Choropleth operation not supported by ${this.backendType} backend`);
  }
  
  async heatmap(
    _reference: string,
    _options?: any
  ): Promise<NativeData> {
    throw new Error(`Heatmap operation not supported by ${this.backendType} backend`);
  }
  
  async categorical(
    _reference: string,
    _categoryField: string,
    _options?: any
  ): Promise<NativeData> {
    throw new Error(`Categorical operation not supported by ${this.backendType} backend`);
  }
  
  async uniformColor(
    _reference: string,
    _options?: any
  ): Promise<NativeData> {
    throw new Error(`Uniform color operation not supported by ${this.backendType} backend`);
  }
  
  abstract read(reference: string): Promise<NativeData>;
  abstract write(data: any, metadata?: any): Promise<string>;
  abstract delete(reference: string): Promise<void>;
  abstract getMetadata(reference: string): Promise<any>;
  abstract validate(reference: string): Promise<boolean>;
  
  // Default implementation for getSchema - can be overridden by subclasses
  async getSchema(_reference: string): Promise<any> {
    throw new Error(`Schema extraction not supported by ${this.backendType} backend`);
  }
}
