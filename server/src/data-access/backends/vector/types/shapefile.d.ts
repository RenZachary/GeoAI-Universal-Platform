/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Type definitions for shapefile library
 * Based on: https://github.com/mbostock/shapefile
 */
declare module 'shapefile' {
  /**
   * GeoJSON Feature interface
   */
  export interface GeoJSONFeature {
    type: 'Feature';
    geometry: {
      type: string;
      coordinates: any;
    } | null;
    properties: Record<string, any> | null;
  }

  /**
   * Source object returned by open()
   */
  export interface Source {
    /**
     * Read next feature from the source
     * Returns { done: true, value: undefined } when exhausted
     * Returns { done: false, value: GeoJSONFeature } when a feature is available
     */
    read(): Promise<{ done: boolean; value?: GeoJSONFeature }>;
    
    /**
     * Bounding box of all features (if available)
     */
    bbox?: [number, number, number, number];
  }

  /**
   * Options for opening a shapefile
   */
  export interface OpenOptions {
    /**
     * The dBASE character encoding for .dbf file properties
     * Common values: 'GBK', 'GB2312', 'UTF-8', 'windows-1252' (default)
     */
    encoding?: string;
    
    /**
     * In Node, the size of the stream's internal buffer
     * Default: 65536
     */
    highWaterMark?: number;
  }

  /**
   * Open a shapefile and return a feature source
   * 
   * @param shp - Path to .shp file (extension optional), ArrayBuffer, Uint8Array, or ReadableStream
   * @param dbf - Optional path to .dbf file. If omitted and shp is a string, defaults to shp with .dbf extension
   * @param options - Options including encoding for DBF file
   * @returns Promise resolving to a Source object
   */
  export function open(
    shp: string | ArrayBuffer | Uint8Array | any,
    dbf?: string | ArrayBuffer | Uint8Array | any | null,
    options?: OpenOptions
  ): Promise<Source>;

  /**
   * Open only the shapefile (.shp) without reading the dBASE file
   * Returns geometries only, no properties
   */
  export function openShp(
    shp: string | ArrayBuffer | Uint8Array | any,
    options?: { highWaterMark?: number }
  ): Promise<Source>;

  /**
   * Open only the dBASE file (.dbf) without reading the shapefile
   * Returns properties only, no geometries
   */
  export function openDbf(
    dbf: string | ArrayBuffer | Uint8Array | any,
    options?: OpenOptions
  ): Promise<{
    read(): Promise<{ done: boolean; value?: Record<string, any> }>;
  }>;
}
