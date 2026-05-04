/**
 * Data Access Layer - Complete interface definitions
 * Defines contracts for all data operations across the platform
 */

import type { NativeData, DataSourceType, DataMetadata } from '../core';

/**
 * Filter condition for attribute-based filtering
 */
export interface AttributeFilter {
  /** Field name to filter on */
  field: string;
  
  /** Operator */
  operator: AttributeFilterOperator;
  
  /** Value to compare against */
  value: any;
  
  /** Logical connector to next condition */
  connector?: 'AND' | 'OR';
  
  /** Nested conditions for complex logic */
  conditions?: (AttributeFilter | SpatialFilter)[];
}

export type AttributeFilterOperator = 
  | 'equals'           // =
  | 'not_equals'       // !=
  | 'greater_than'     // >
  | 'less_than'        // <
  | 'greater_equal'    // >=
  | 'less_equal'       // <=
  | 'contains'         // LIKE '%value%'
  | 'starts_with'      // LIKE 'value%'
  | 'ends_with'        // LIKE '%value'
  | 'in'               // IN (val1, val2, ...)
  | 'between'          // BETWEEN val1 AND val2
  | 'is_null'          // IS NULL
  | 'is_not_null';     // IS NOT NULL

/**
 * Spatial filter for geometry-based filtering
 */
export interface SpatialFilter {
  /** Spatial operation type */
  type: 'spatial';
  
  /** Spatial relationship */
  operation: SpatialOperation;
  
  /** Reference to another dataset for spatial comparison */
  referenceDataSourceId?: string;
  
  /** Geometry literal for spatial comparison */
  geometry?: any; // GeoJSON geometry
  
  /** Distance for buffer-based operations */
  distance?: number;
  
  /** Distance unit */
  unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
  
  /** Logical connector to next condition */
  connector?: 'AND' | 'OR';
  
  /** Nested conditions */
  conditions?: (AttributeFilter | SpatialFilter)[];
}

export type SpatialOperation = 
  | 'intersects'      // ST_Intersects
  | 'contains'        // ST_Contains
  | 'within'          // ST_Within
  | 'touches'         // ST_Touches
  | 'crosses'         // ST_Crosses
  | 'overlaps'        // ST_Overlaps
  | 'disjoint'        // ST_Disjoint
  | 'distance_less_than'  // ST_Distance < X
  | 'distance_greater_than'; // ST_Distance > X

/**
 * Combined filter type - can be attribute or spatial
 */
export type FilterCondition = AttributeFilter | SpatialFilter;

/**
 * Buffer operation options
 */
export interface BufferOptions {
  /** Distance unit */
  unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
  /** Dissolve overlapping buffers */
  dissolve?: boolean;
  /** Number of segments for circular arcs */
  segments?: number;
}

/**
 * Overlay operation types
 */
export type OverlayOperation = 'intersect' | 'union' | 'difference' | 'symmetric_difference';

/**
 * Overlay operation options
 */
export interface OverlayOptions {
  /** Operation type */
  operation: OverlayOperation;
}

// ============================================================================
// Core Data Accessor Interface
// ============================================================================

/**
 * Base interface for all data accessors
 * All format-specific accessors must implement this contract
 */
export interface DataAccessor {
  /** Accessor type identifier */
  readonly type: DataSourceType;
  
  // ==========================================================================
  // Basic CRUD Operations
  // ==========================================================================
  
  /**
   * Read data from source and return as NativeData (metadata + reference)
   * @param reference - Data source reference (file path, table name, URL, etc.)
   * @returns Promise resolving to NativeData object
   */
  read(reference: string): Promise<NativeData>;
  
  /**
   * Write data to destination
   * @param data - Data to write (GeoJSON, statistics, etc.)
   * @param metadata - Optional metadata to attach
   * @returns Promise resolving to reference string
   */
  write(data: any, metadata?: Partial<DataMetadata>): Promise<string>;
  
  /**
   * Delete data by reference
   * @param reference - Data source reference to delete
   */
  delete(reference: string): Promise<void>;
  
  /**
   * Get metadata for existing data
   * @param reference - Data source reference
   * @returns Promise resolving to DataMetadata
   */
  getMetadata(reference: string): Promise<DataMetadata>;
  
  /**
   * Validate data format integrity
   * @param reference - Data source reference to validate
   * @returns Promise resolving to boolean
   */
  validate(reference: string): Promise<boolean>;
  
  // ==========================================================================
  // Spatial Analysis Operations
  // Each accessor implements using native capabilities
  // ==========================================================================
  
  /**
   * Perform buffer operation on data source
   * @param reference - Data source reference
   * @param distance - Buffer distance
   * @param options - Buffer options (unit, dissolve, etc.)
   * @returns Promise resolving to NativeData with buffered result
   */
  buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData>;
  
  /**
   * Perform overlay operation between two data sources
   * @param reference1 - First data source reference
   * @param reference2 - Second data source reference
   * @param options - Overlay options (operation type)
   * @returns Promise resolving to NativeData with overlay result
   */
  overlay(reference1: string, reference2: string, options: OverlayOptions): Promise<NativeData>;
  
  /**
   * Filter data based on attribute or spatial conditions
   * @param reference - Data source reference
   * @param filterCondition - Filter conditions
   * @returns Promise resolving to NativeData with filtered result
   */
  filter(reference: string, filterCondition: FilterCondition): Promise<NativeData>;
  
  /**
   * Aggregate data (MAX, MIN, AVG, SUM, COUNT)
   * @param reference - Data source reference
   * @param aggFunc - Aggregation function
   * @param field - Field to aggregate
   * @param returnFeature - Whether to return the feature with max/min value
   * @returns Promise resolving to NativeData with aggregation result
   */
  aggregate(reference: string, aggFunc: string, field: string, returnFeature?: boolean): Promise<NativeData>;
  
  /**
   * Perform spatial join between two data sources
   * @param targetReference - Target data source reference
   * @param joinReference - Join data source reference
   * @param operation - Spatial relationship operation
   * @param joinType - Join type (inner, left, right)
   * @returns Promise resolving to NativeData with joined result
   */
  spatialJoin(targetReference: string, joinReference: string, operation: string, joinType?: string): Promise<NativeData>;
}

// ============================================================================
// Specialized Accessor Interfaces
// ============================================================================

/**
 * File-based accessor interface
 * Extends base with file system specific operations
 */
export interface FileAccessor extends DataAccessor {
  /** Check if file exists */
  exists(reference: string): Promise<boolean>;
  
  /** Get file size in bytes */
  getFileSize(reference: string): Promise<number>;
  
  /** Get file modification time */
  getModifiedTime(reference: string): Promise<Date>;
}

/**
 * Database accessor interface
 * Extends base with database-specific operations
 */
export interface DatabaseAccessor extends DataAccessor {
  /** Test database connection */
  testConnection(): Promise<boolean>;
  
  /** Execute raw SQL query */
  executeQuery(sql: string, params?: any[]): Promise<any[]>;
  
  /** Get table/column information */
  getSchema(tableName: string): Promise<TableSchema>;
  
  /** List available tables */
  listTables(): Promise<string[]>;
}

/**
 * PostGIS accessor extends database accessor with spatial operations
 */
export interface PostGISAccessor extends DatabaseAccessor {
  /** Get spatial reference system info */
  getSRID(tableName: string, geometryColumn: string): Promise<number>;
  
  /** Get spatial extent */
  getSpatialExtent(tableName: string, geometryColumn: string): Promise<[number, number, number, number]>;
  
  /** Check if geometry column exists */
  hasGeometryColumn(tableName: string): Promise<boolean>;
}

/**
 * Web service accessor (WMS, WFS, etc.)
 */
export interface WebServiceAccessor extends DataAccessor {
  /** Get service capabilities */
  getCapabilities(url: string): Promise<any>;
  
  /** Check service availability */
  isAvailable(url: string): Promise<boolean>;
  
  /** Get supported CRS list */
  getSupportedCRS(url: string): Promise<string[]>;
}

// ============================================================================
// Schema & Metadata Types
// ============================================================================

export interface TableSchema {
  tableName: string;
  columns: ColumnInfo[];
  primaryKey?: string;
  indexes: IndexInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: any;
  isPrimaryKey: boolean;
  isGeometryColumn?: boolean;
  srid?: number;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isSpatial?: boolean;
}

// ============================================================================
// Factory & Registry Interfaces
// ============================================================================

/**
 * Accessor registry for managing registered accessors
 */
export interface AccessorRegistry {
  /** Register a custom accessor */
  register(type: DataSourceType, accessor: DataAccessor): void;
  
  /** Unregister an accessor */
  unregister(type: DataSourceType): void;
  
  /** Get accessor by type */
  get(type: DataSourceType): DataAccessor | undefined;
  
  /** List all registered types */
  listTypes(): DataSourceType[];
}
