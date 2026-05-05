/**
 * GeoJSON-Based Accessor Base Class
 * 
 * Common implementation for GeoJSON and Shapefile accessors
 * Delegates operations to modular operation classes
 */

import fs from 'fs';
import path from 'path';
import type { NativeData, DataMetadata } from '../../../../core';
import { generateId } from '../../../../core';
import type { BufferOptions, OverlayOptions, FilterCondition } from '../../../interfaces';
import { GeoJSONFilterOperation } from './operations/GeoJSONFilterOperation';
import { GeoJSONBufferOperation } from './operations/GeoJSONBufferOperation';
import { GeoJSONOverlayOperation } from './operations/GeoJSONOverlayOperation';
import { GeoJSONSpatialJoinOperation } from './operations/GeoJSONSpatialJoinOperation';
import { GeoJSONStatisticalOperation } from './operations/GeoJSONStatisticalOperation';

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: any[];
  crs?: any;
}

export abstract class GeoJSONBasedAccessor {
  protected readonly workspaceBase: string;
  
  // Operation modules
  private filterOp = new GeoJSONFilterOperation();
  private bufferOp = new GeoJSONBufferOperation();
  private overlayOp = new GeoJSONOverlayOperation();
  private spatialJoinOp = new GeoJSONSpatialJoinOperation();
  public readonly statisticalOp = new GeoJSONStatisticalOperation();

  constructor(workspaceBase: string) {
    this.workspaceBase = workspaceBase;
  }

  /**
   * Abstract method to load GeoJSON from source
   */
  protected abstract loadGeoJSON(reference: string): Promise<GeoJSONFeatureCollection>;

  /**
   * Abstract method to save GeoJSON to destination
   */
  protected abstract saveGeoJSON(geojson: GeoJSONFeatureCollection, hint?: string): Promise<string>;

  /**
   * Get metadata from GeoJSON
   */
  protected extractMetadata(geojson: GeoJSONFeatureCollection, reference: string): DataMetadata {
    const featureCount = geojson.features?.length || 0;
    const geometryTypes = new Set(
      geojson.features.map((f: any) => f.geometry?.type).filter(Boolean)
    );

    return {
      featureCount,
      geometryType: geometryTypes.size === 1 ? Array.from(geometryTypes)[0] : 'Mixed',
      crs: this.extractCRS(geojson),
      bbox: this.calculateBbox(geojson),
      fields: this.extractFields(geojson) as Array<{name: string; type: string}> | string[],
      sampleValues: this.extractSampleValues(geojson)
    };
  }

  /**
   * Filter GeoJSON features based on conditions
   */
  async filter(reference: string, filterCondition: FilterCondition): Promise<NativeData> {
    const geojson = await this.loadGeoJSON(reference);
    return this.filterOp.execute(geojson, filterCondition, this.saveGeoJSON.bind(this), this.extractMetadata.bind(this));
  }

  /**
   * Perform buffer operation on GeoJSON
   */
  async buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
    const geojson = await this.loadGeoJSON(reference);
    return this.bufferOp.execute(geojson, distance, options, this.saveGeoJSON.bind(this), this.extractMetadata.bind(this));
  }

  /**
   * Perform spatial join between two GeoJSON sources
   */
  async spatialJoin(
    targetReference: string,
    joinReference: string,
    operation: string,
    joinType: string = 'inner'
  ): Promise<NativeData> {
    const targetGeoJSON = await this.loadGeoJSON(targetReference);
    const joinGeoJSON = await this.loadGeoJSON(joinReference);
    return this.spatialJoinOp.execute(targetGeoJSON, joinGeoJSON, operation, joinType, this.saveGeoJSON.bind(this), this.extractMetadata.bind(this));
  }
  
  /**
   * Aggregate data (MAX, MIN, AVG, SUM, COUNT)
   */
  async aggregate(reference: string, aggFunc: string, field: string, returnFeature: boolean = false): Promise<NativeData> {
    const geojson = await this.loadGeoJSON(reference);
    
    if (!geojson.features || geojson.features.length === 0) {
      throw new Error('Cannot aggregate empty dataset');
    }
    
    let result: any;
    
    switch (aggFunc.toUpperCase()) {
      case 'MAX':
        result = this.aggregateMax(geojson, field, returnFeature);
        break;
      case 'MIN':
        result = this.aggregateMin(geojson, field, returnFeature);
        break;
      case 'AVG':
        result = this.aggregateAvg(geojson, field);
        break;
      case 'SUM':
        result = this.aggregateSum(geojson, field);
        break;
      case 'COUNT':
        result = { value: geojson.features.length };
        break;
      default:
        throw new Error(`Unsupported aggregation function: ${aggFunc}`);
    }
    
    return {
      id: generateId(),
      type: 'scalar' as any,
      reference: '',
      metadata: {
        operation: 'aggregate',
        aggregatedField: field,
        aggregatedFunction: aggFunc,
        aggregatedValue: result.value,
        feature: result.feature || null
      },
      createdAt: new Date()
    };
  }
  
  private aggregateMax(geojson: any, field: string, returnFeature: boolean): any {
    let maxValue = -Infinity;
    let maxFeature: any = null;
    
    for (const feature of geojson.features) {
      const value = feature.properties?.[field];
      if (value !== undefined && value !== null && typeof value === 'number') {
        if (value > maxValue) {
          maxValue = value;
          maxFeature = feature;
        }
      }
    }
    
    return {
      value: maxValue === -Infinity ? null : maxValue,
      feature: returnFeature && maxFeature ? maxFeature : null
    };
  }
  
  private aggregateMin(geojson: any, field: string, returnFeature: boolean): any {
    let minValue = Infinity;
    let minFeature: any = null;
    
    for (const feature of geojson.features) {
      const value = feature.properties?.[field];
      if (value !== undefined && value !== null && typeof value === 'number') {
        if (value < minValue) {
          minValue = value;
          minFeature = feature;
        }
      }
    }
    
    return {
      value: minValue === Infinity ? null : minValue,
      feature: returnFeature && minFeature ? minFeature : null
    };
  }
  
  private aggregateAvg(geojson: any, field: string): any {
    let sum = 0;
    let count = 0;
    
    for (const feature of geojson.features) {
      const value = feature.properties?.[field];
      if (value !== undefined && value !== null && typeof value === 'number') {
        sum += value;
        count++;
      }
    }
    
    return {
      value: count > 0 ? sum / count : null
    };
  }
  
  private aggregateSum(geojson: any, field: string): any {
    let sum = 0;
    
    for (const feature of geojson.features) {
      const value = feature.properties?.[field];
      if (value !== undefined && value !== null && typeof value === 'number') {
        sum += value;
      }
    }
    
    return { value: sum };
  }
  
  /**
   * Perform overlay operation between two GeoJSON sources
   */
  async overlay(
    reference1: string,
    reference2: string,
    options: OverlayOptions
  ): Promise<NativeData> {
    const geojson1 = await this.loadGeoJSON(reference1);
    const geojson2 = await this.loadGeoJSON(reference2);
    return this.overlayOp.execute(geojson1, geojson2, options, this.saveGeoJSON.bind(this), this.extractMetadata.bind(this));
  }

  // ========================================================================
  // Protected Helper Methods
  // ========================================================================

  protected extractCRS(geojson: GeoJSONFeatureCollection): string | undefined {
    if (geojson.crs) {
      if (geojson.crs.properties?.name) {
        return geojson.crs.properties.name;
      }
    }
    return 'EPSG:4326'; // Default to WGS84
  }

  protected calculateBbox(geojson: GeoJSONFeatureCollection): [number, number, number, number] | undefined {
    if (!geojson.features || geojson.features.length === 0) {
      return undefined;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const feature of geojson.features) {
      const coords = this.extractCoordinates(feature.geometry);
      for (const [lon, lat] of coords) {
        minX = Math.min(minX, lon);
        minY = Math.min(minY, lat);
        maxX = Math.max(maxX, lon);
        maxY = Math.max(maxY, lat);
      }
    }

    if (minX === Infinity) {
      return undefined;
    }

    return [minX, minY, maxX, maxY];
  }

  protected extractCoordinates(geometry: any): Array<[number, number]> {
    const coords: Array<[number, number]> = [];

    const extract = (geom: any) => {
      if (!geom || !geom.coordinates) return;

      switch (geom.type) {
        case 'Point':
          coords.push(geom.coordinates);
          break;
        case 'LineString':
        case 'MultiPoint':
          coords.push(...geom.coordinates);
          break;
        case 'Polygon':
        case 'MultiLineString':
          geom.coordinates.forEach((ring: any) => extract({ type: 'LineString', coordinates: ring }));
          break;
        case 'MultiPolygon':
          geom.coordinates.forEach((poly: any) => {
            poly.forEach((ring: any) => extract({ type: 'LineString', coordinates: ring }));
          });
          break;
      }
    };

    extract(geometry);
    return coords;
  }

  protected extractFields(geojson: GeoJSONFeatureCollection): Array<{name: string; type: string}> {
    if (!geojson.features || geojson.features.length === 0) {
      return [];
    }

    // Collect field types from first 10 features
    const fieldTypes = new Map<string, Set<string>>();
    
    for (const feature of geojson.features.slice(0, 10)) {
      if (feature.properties) {
        for (const [key, value] of Object.entries(feature.properties)) {
          if (!fieldTypes.has(key)) {
            fieldTypes.set(key, new Set());
          }
          
          // Determine type
          let fieldType = 'string';
          if (typeof value === 'number') {
            fieldType = Number.isInteger(value) ? 'integer' : 'number';
          } else if (typeof value === 'boolean') {
            fieldType = 'boolean';
          } else if (value instanceof Date) {
            fieldType = 'date';
          }
          
          fieldTypes.get(key)!.add(fieldType);
        }
      }
    }

    // Resolve final type for each field (use most common or prefer numeric)
    const fields: Array<{name: string; type: string}> = [];
    for (const [fieldName, types] of fieldTypes) {
      const typeArray = Array.from(types);
      
      // If any sample is numeric, mark as numeric
      let finalType = 'string';
      if (typeArray.includes('integer')) {
        finalType = 'integer';
      } else if (typeArray.includes('number')) {
        finalType = 'number';
      } else if (typeArray.includes('boolean')) {
        finalType = 'boolean';
      } else if (typeArray.includes('date')) {
        finalType = 'date';
      }
      
      fields.push({ name: fieldName, type: finalType });
    }

    return fields;
  }

  protected extractSampleValues(geojson: GeoJSONFeatureCollection): Record<string, any> {
    if (!geojson.features || geojson.features.length === 0) {
      return {};
    }

    const samples: Record<string, any> = {};
    const sampleFeature = geojson.features[0];

    if (sampleFeature.properties) {
      for (const [key, value] of Object.entries(sampleFeature.properties)) {
        samples[key] = {
          example: value,
          isNumeric: typeof value === 'number',
          min: typeof value === 'number' ? value : undefined,
          max: typeof value === 'number' ? value : undefined
        };
      }
    }

    return samples;
  }

  protected getResultsDir(subdir: string = 'geojson'): string {
    const dir = path.join(this.workspaceBase, 'results', subdir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
}
