/**
 * GeoJSON Type Definitions
 * 
 * Centralized GeoJSON types for the entire platform.
 * These are standard GeoJSON types as defined in RFC 7946.
 */

/**
 * Position - A position is an array of numbers
 */
export type Position = number[];

/**
 * Bounding Box
 */
export type BBox = [number, number, number, number] | [number, number, number, number, number, number];

/**
 * GeoJSON Geometry Types
 */
export type GeometryType = 'Point' | 'MultiPoint' | 'LineString' | 'MultiLineString' | 
                           'Polygon' | 'MultiPolygon' | 'GeometryCollection';

/**
 * Base Geometry interface
 */
export interface Geometry {
  type: GeometryType;
  bbox?: BBox;
}

export interface Point extends Geometry {
  type: 'Point';
  coordinates: Position;
}

export interface MultiPoint extends Geometry {
  type: 'MultiPoint';
  coordinates: Position[];
}

export interface LineString extends Geometry {
  type: 'LineString';
  coordinates: Position[];
}

export interface MultiLineString extends Geometry {
  type: 'MultiLineString';
  coordinates: Position[][];
}

export interface Polygon extends Geometry {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface MultiPolygon extends Geometry {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export interface GeometryCollection extends Geometry {
  type: 'GeometryCollection';
  geometries: Geometry[];
}

/**
 * GeoJSON Properties
 */
export type GeoJsonProperties = { [name: string]: any } | null;

/**
 * GeoJSON Feature
 */
export interface Feature<G extends Geometry = Geometry, P = GeoJsonProperties> {
  type: 'Feature';
  geometry: G | null;
  properties: P;
  id?: string | number;
  bbox?: BBox;
}

/**
 * GeoJSON FeatureCollection
 */
export interface FeatureCollection<G extends Geometry = Geometry, P = GeoJsonProperties> {
  type: 'FeatureCollection';
  features: Array<Feature<G, P>>;
  bbox?: BBox;
}

/**
 * Platform FeatureCollection - Extended GeoJSON with CRS support
 * 
 * This is the SINGLE SOURCE OF TRUTH for all GeoJSON operations across the platform.
 * All vector backends, operations, and utilities MUST use this type.
 * 
 * @example
 * ```typescript
 * import type { PlatformFeatureCollection } from '../core/types/geojson';
 * 
 * const data: PlatformFeatureCollection = await loadGeoJSON(path);
 * ```
 */
export type PlatformFeatureCollection = FeatureCollection & {
  /**
   * Optional Coordinate Reference System information
   * Used for tracking coordinate system transformations
   */
  crs?: any;
};
