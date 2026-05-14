/**
 * VectorBackend - Pure Turf.js implementation for vector data operations
 * 
 * Zero dependency on old accessor code.
 * Directly uses Turf.js for all spatial operations.
 */

import fs from 'fs';
import path from 'path';
import * as turf from '@turf/turf';
import type { NativeData, DataMetadata, PlatformFeatureCollection } from '../../../core';
import { generateId, wrapError } from '../../../core';
import type { FilterCondition, BufferOptions } from '../../interfaces';
import type { DataBackend } from '../DataBackend';
import { BufferOperation } from './operations/BufferOperation';
import { OverlayOperation } from './operations/OverlayOperation';
import { FilterOperation } from './operations/FilterOperation';
import { AggregateOperation } from './operations/AggregateOperation';
import { SpatialJoinOperation } from './operations/SpatialJoinOperation';
import { VectorStatisticalOperation } from './operations/VectorStatisticalOperation';
import { ProximityOperation } from './operations/ProximityOperation';
import { tryMultipleEncodings } from '../../utils/ShapefileEncodingUtils';  
import { SQLiteManagerInstance } from '../../../storage';
import { DataSourceRepository } from '../../repositories/DataSourceRepository';

export class VectorBackend implements DataBackend {
  readonly backendType = 'vector' as const;

  private workspaceBase: string;
  private bufferOp: BufferOperation;
  private overlayOp: OverlayOperation;
  private filterOp: FilterOperation;
  private aggregateOp: AggregateOperation;
  private spatialJoinOp: SpatialJoinOperation;
  private statisticalOp: VectorStatisticalOperation;
  private proximityOp: ProximityOperation;

  constructor(workspaceBase?: string) {
    this.workspaceBase = workspaceBase || process.cwd();
    this.bufferOp = new BufferOperation();
    this.overlayOp = new OverlayOperation();
    this.filterOp = new FilterOperation();
    this.aggregateOp = new AggregateOperation();
    this.spatialJoinOp = new SpatialJoinOperation();
    this.statisticalOp = new VectorStatisticalOperation();
    this.proximityOp = new ProximityOperation();
  }

  canHandle(dataSourceType: string, _reference: string): boolean {
    return dataSourceType === 'geojson' || dataSourceType === 'shapefile';
  }

  // ========== Core Spatial Operations (delegate to operation classes) ==========

  async buffer(reference: string, distance: number, options?: BufferOptions): Promise<NativeData> {
    const geojson = await this.loadGeoJSON(reference);
    const result = await this.bufferOp.execute(geojson, distance, options);
    const outputPath = await this.saveGeoJSON(result);
    const metadata = this.extractMetadata(result, outputPath);

    return {
      id: generateId(),
      type: 'geojson',
      reference: outputPath,
      metadata: {
        ...metadata,
        result: outputPath,
        description: `Buffer operation completed with distance ${distance} ${options?.unit || 'meters'}`
      },
      createdAt: new Date()
    };
  }

  async overlay(
    reference1: string,
    reference2: string,
    operation: 'intersect' | 'union' | 'difference' | 'symmetric_difference'
  ): Promise<NativeData> {
    const geojson1 = await this.loadGeoJSON(reference1);
    const geojson2 = await this.loadGeoJSON(reference2);
    const result = await this.overlayOp.execute(geojson1, geojson2, operation);
    const outputPath = await this.saveGeoJSON(result);
    const metadata = this.extractMetadata(result, outputPath);

    return {
      id: generateId(),
      type: 'geojson',
      reference: outputPath,
      metadata: {
        ...metadata,
        result: outputPath,
        description: `Overlay ${operation} operation completed`
      },
      createdAt: new Date()
    };
  }

  async filter(reference: string, filterCondition: FilterCondition): Promise<NativeData> {
    // If filter condition has referenceDataSourceId, resolve it to actual geometry
    let resolvedCondition = filterCondition;

    if ('type' in filterCondition && filterCondition.type === 'spatial' && (filterCondition as any).referenceDataSourceId) {
      // Get database instance from DataSourceRepository
      const dataSourceRepo = new DataSourceRepository(SQLiteManagerInstance.getDatabase());
      const refDataSource = dataSourceRepo.getById((filterCondition as any).referenceDataSourceId);

      if (!refDataSource) {
        throw new Error(`Reference data source not found: ${(filterCondition as any).referenceDataSourceId}`);
      }

      // Use VectorBackend to load the referenced data source
      const vb = new VectorBackend(this.workspaceBase);
      const refData = await vb.loadGeoJSON(refDataSource.reference);

      if ((refData as any).features && (refData as any).features.length > 0) {
        const geometry = (refData as any).features[0].geometry;

        // Create new condition with geometry instead of referenceDataSourceId
        resolvedCondition = {
          ...filterCondition,
          geometry: geometry
        } as FilterCondition;
        delete (resolvedCondition as any).referenceDataSourceId;
      } else {
        throw new Error('No features found in reference data source');
      }
    }

    const geojson = await this.loadGeoJSON(reference);
    const result = await this.filterOp.execute(geojson, resolvedCondition);
    const outputPath = await this.saveGeoJSON(result);
    const metadata = this.extractMetadata(result, outputPath);

    return {
      id: generateId(),
      type: 'geojson',
      reference: outputPath,
      metadata: {
        ...metadata,
        result: outputPath,
        description: `Filter operation completed, ${result.features.length} features matched`
      },
      createdAt: new Date()
    };
  }

  async aggregate(
    reference: string,
    aggFunc: string,
    field: string,
    returnFeature?: boolean
  ): Promise<NativeData> {
    const geojson = await this.loadGeoJSON(reference);
    const result = await this.aggregateOp.execute(geojson, aggFunc, field, returnFeature);
    const outputPath = await this.saveGeoJSON(result);

    // Extract scalar value for non-feature results
    let scalarValue: number | undefined;
    if (!returnFeature && result.features && result.features.length > 0) {
      const props = result.features[0].properties;
      if (props) {
        // Try common property names for aggregation results
        scalarValue = props.count ?? props.sum ?? props.avg ?? props.min ?? props.max ?? props.value;
      }
    }

    return {
      id: generateId(),
      type: 'geojson',
      reference: outputPath,
      metadata: {
        result: outputPath,
        description: `Aggregation ${aggFunc} on field ${field}`,
        featureCount: returnFeature ? 1 : 0,
        value: scalarValue  // Add scalar value for aggregation results
      },
      createdAt: new Date()
    };
  }

  async spatialJoin(
    targetReference: string,
    joinReference: string,
    operation: string,
    joinType?: string
  ): Promise<NativeData> {
    const targetGeoJSON = await this.loadGeoJSON(targetReference);
    const joinGeoJSON = await this.loadGeoJSON(joinReference);
    const result = await this.spatialJoinOp.execute(targetGeoJSON, joinGeoJSON, operation, joinType);
    const outputPath = await this.saveGeoJSON(result);
    const metadata = this.extractMetadata(result, outputPath);

    return {
      id: generateId(),
      type: 'geojson',
      reference: outputPath,
      metadata: {
        ...metadata,
        result: outputPath,
        description: `Spatial join (${operation}, ${joinType}) completed, ${result.features.length} features`
      },
      createdAt: new Date()
    };
  }

  // ========== Visualization Operations (to be implemented in separate module) ==========

  async choropleth(): Promise<NativeData> {
    throw new Error('Choropleth visualization requires classification logic - not yet implemented');
  }

  async heatmap(): Promise<NativeData> {
    throw new Error('Heatmap visualization requires density calculation - not yet implemented');
  }

  async categorical(): Promise<NativeData> {
    throw new Error('Categorical visualization requires color mapping - not yet implemented');
  }

  async uniformColor(): Promise<NativeData> {
    throw new Error('Uniform color visualization is a rendering concern, not a data operation');
  }

  // ========== CRUD Operations ==========

  async read(reference: string): Promise<NativeData> {
    if (!fs.existsSync(reference)) {
      throw new Error(`File not found: ${reference}`);
    }

    const geojson = await this.loadGeoJSON(reference);
    const metadata = this.extractMetadata(geojson, reference);

    return {
      id: generateId(),
      type: 'geojson',
      reference,
      metadata: {
        ...metadata,
        result: null,
        description: 'Vector data source loaded successfully'
      },
      createdAt: new Date()
    };
  }

  async write(data: any, _metadata?: any): Promise<string> {
    return this.saveGeoJSON(data);
  }

  async delete(reference: string): Promise<void> {
    try {
      fs.rmSync(reference, { force: true });
    } catch (error) {
      console.error(`Failed to delete file: ${reference}`, error);
      throw error;
    }
  }

  async getMetadata(reference: string): Promise<any> {
    const geojson = await this.loadGeoJSON(reference);
    return this.extractMetadata(geojson, reference);
  }

  async validate(reference: string): Promise<boolean> {
    try {
      if (!fs.existsSync(reference)) {
        return false;
      }

      const ext = path.extname(reference).toLowerCase();
      if (!['.geojson', '.json'].includes(ext)) {
        return false;
      }

      const content = fs.readFileSync(reference, 'utf-8');
      const geojson = JSON.parse(content);

      return geojson.type === 'Feature' || geojson.type === 'FeatureCollection';
    } catch (error) {
      console.error('Validation failed:', error);
      return false;
    }
  }

  // ========== Private Helper Methods ==========

  private async loadGeoJSON(reference: string): Promise<PlatformFeatureCollection> {
    const ext = path.extname(reference).toLowerCase();

    // Handle Shapefile - convert to GeoJSON first
    if (ext === '.shp' || reference.includes('shapefile')) {
      return await this.loadShapefileAsGeoJSON(reference);
    }

    // Handle GeoJSON file
    const content = fs.readFileSync(reference, 'utf-8');
    const geojson = JSON.parse(content);

    if (geojson.type === 'Feature') {
      return {
        type: 'FeatureCollection',
        features: [geojson]
      };
    }

    if (geojson.type !== 'FeatureCollection') {
      throw new Error('Invalid GeoJSON format: must be Feature or FeatureCollection');
    }

    return geojson;
  }

  /**
   * Load a shapefile and convert to GeoJSON using the 'shapefile' library
   * Uses shared ShapefileEncodingUtils for intelligent encoding detection
   */
  private async loadShapefileAsGeoJSON(shpPath: string): Promise<PlatformFeatureCollection> {
    try {
      // Import shapefile library dynamically
      const shapefileModule = await import('shapefile');

      // Remove .shp extension for the shapefile library
      const shapefilePath = shpPath.replace(/\.shp$/i, '');

      // Use shared encoding utility with automatic detection
      const features = await tryMultipleEncodings(
        async (encoding) => {
          return await (shapefileModule as any).open(shapefilePath, undefined, { encoding });
        },
        shapefilePath
      );

      // Cast features to proper GeoJSON Feature type
      // The shapefile library returns complete GeoJSON features with geometry and properties
      const geojsonFeatures = features as PlatformFeatureCollection['features'];

      // Return as FeatureCollection
      return {
        type: 'FeatureCollection',
        features: geojsonFeatures
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw wrapError(error, `Failed to load shapefile: ${message}`);
    }
  }

  private async saveGeoJSON(geojson: PlatformFeatureCollection): Promise<string> {
    const workspaceDir = this.workspaceBase || './workspace';
    const resultsDir = path.join(workspaceDir, 'results', 'geojson');

    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const fileId = generateId();
    const filename = `${fileId}.geojson`;
    const filepath = path.join(resultsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(geojson, null, 2));
    return filepath;
  }

  private extractMetadata(geojson: PlatformFeatureCollection, reference: string): DataMetadata {
    const stats = fs.statSync(reference);
    const featureCount = geojson.features?.length || 0;
    const geometryTypes = new Set(
      geojson.features.map((f: any) => f.geometry?.type).filter(Boolean)
    );

    return {
      fileSize: stats.size,
      featureCount,
      geometryType: geometryTypes.size === 1 ? Array.from(geometryTypes)[0] : 'Mixed',
      crs: this.extractCRS(geojson),
      bbox: this.calculateBbox(geojson) || undefined,
      fields: this.extractFields(geojson),
      sampleValues: this.extractSampleValues(geojson)
    };
  }

  private extractCRS(_geojson: PlatformFeatureCollection): string {
    return 'EPSG:4326';
  }

  private calculateBbox(geojson: PlatformFeatureCollection): [number, number, number, number] | null {
    try {
      const bbox = (turf as any).bbox(geojson);
      return bbox ? [bbox[0], bbox[1], bbox[2], bbox[3]] : null;
    } catch {
      return null;
    }
  }

  private extractFields(geojson: PlatformFeatureCollection): any[] {
    if (geojson.features.length === 0) return [];

    const firstFeature = geojson.features[0];
    const properties = firstFeature.properties || {};

    return Object.keys(properties).map(key => ({
      name: key,
      type: typeof properties[key]
    }));
  }

  private extractSampleValues(geojson: PlatformFeatureCollection): Record<string, any[]> {
    const samples: Record<string, any[]> = {};
    const maxSamples = 5;

    for (const feature of geojson.features.slice(0, maxSamples)) {
      const properties = feature.properties || {};
      for (const [key, value] of Object.entries(properties)) {
        if (!samples[key]) {
          samples[key] = [];
        }
        if (samples[key].length < maxSamples) {
          samples[key].push(value);
        }
      }
    }

    return samples;
  }

  async getSchema(_reference: string): Promise<any> {
    // For vector backends, schema is extracted from GeoJSON properties
    // This method is typically not used for file-based sources
    throw new Error('Schema extraction for vector files should use metadata from registration');
  }

  // ========== Statistical Operations ==========

  async getUniqueValues(reference: string, fieldName: string): Promise<string[]> {
    const geojson = await this.loadGeoJSON(reference);
    return this.statisticalOp.getUniqueValues(geojson, fieldName);
  }

  async getFieldStatistics(reference: string, fieldName: string): Promise<any> {
    const geojson = await this.loadGeoJSON(reference);
    return this.statisticalOp.getFieldStatistics(geojson, fieldName);
  }

  async getClassificationBreaks(
    reference: string,
    fieldName: string,
    method: 'quantile' | 'equal_interval' | 'jenks' | 'standard_deviation',
    numClasses: number = 5
  ): Promise<number[]> {
    const geojson = await this.loadGeoJSON(reference);
    return this.statisticalOp.getClassificationBreaks(geojson, fieldName, method, numClasses);
  }

  // ========== Proximity Operations ==========

  async calculateDistance(
    reference1: string,
    reference2: string,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
      maxPairs?: number;
    }
  ): Promise<Array<{ sourceId: string | number; targetId: string | number; distance: number; unit: string }>> {
    const geojson1 = await this.loadGeoJSON(reference1);
    const geojson2 = await this.loadGeoJSON(reference2);

    return this.proximityOp.calculateDistance(geojson1, geojson2, options);
  }

  async findNearestNeighbors(
    sourceReference: string,
    targetReference: string,
    limit: number,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
    }
  ): Promise<Array<{
    sourceId: string | number;
    nearestTargetId: string | number;
    distance: number;
    unit: string;
    rank: number;
  }>> {
    const sourceGeoJSON = await this.loadGeoJSON(sourceReference);
    const targetGeoJSON = await this.loadGeoJSON(targetReference);

    return this.proximityOp.findNearestNeighbors(sourceGeoJSON, targetGeoJSON, limit, options);
  }

  async filterByDistance(
    reference: string,
    centerReference: string,
    distance: number,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles' | 'degrees';
    }
  ): Promise<NativeData> {
    const geojson = await this.loadGeoJSON(reference);
    const centerGeoJSON = await this.loadGeoJSON(centerReference);

    // Get the first feature from center as reference point
    const centerFeature = centerGeoJSON.features[0];
    if (!centerFeature) {
      throw new Error('Center reference must contain at least one feature');
    }

    // Filter using ProximityOperation
    const result = this.proximityOp.filterByDistance(geojson, centerFeature, distance, options);

    // Save result
    const outputPath = await this.saveGeoJSON(result);
    const metadata = this.extractMetadata(result, outputPath);

    return {
      id: generateId(),
      type: 'geojson',
      reference: outputPath,
      metadata: {
        ...metadata,
        result: outputPath,
        description: `Filtered features within ${distance} ${options?.unit || 'meters'} of center`,
        originalCount: geojson.features.length,
        filteredCount: result.features.length
      },
      createdAt: new Date()
    };
  }
  
  // ========== Spatial Metric Operations ==========
  
  async calculateAreaStats(
    reference: string,
    options?: {
      unit?: 'square_meters' | 'square_kilometers' | 'hectares';
    }
  ): Promise<{ min: number; max: number; mean: number; sum: number; count: number }> {
    const geojson = await this.loadGeoJSON(reference);
    const unit = options?.unit || 'square_meters';
    
    const areas: number[] = [];
    
    for (const feature of geojson.features) {
      if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
        try {
          // Turf.js area returns square meters by default
          const areaSqMeters = (turf as any).area(feature);
          
          // Convert to requested unit
          let areaValue = areaSqMeters;
          if (unit === 'square_kilometers') {
            areaValue = areaSqMeters / 1000000;
          } else if (unit === 'hectares') {
            areaValue = areaSqMeters / 10000;
          }
          
          if (areaValue > 0) {
            areas.push(areaValue);
          }
        } catch (error) {
          console.warn('[VectorBackend] Failed to calculate area for feature:', error);
        }
      }
    }
    
    if (areas.length === 0) {
      return { min: 0, max: 0, mean: 0, sum: 0, count: 0 };
    }
    
    const sum = areas.reduce((acc, val) => acc + val, 0);
    const min = Math.min(...areas);
    const max = Math.max(...areas);
    const mean = sum / areas.length;
    
    return { min, max, mean, sum, count: areas.length };
  }
  
  async calculatePerimeterStats(
    reference: string,
    options?: {
      unit?: 'meters' | 'kilometers' | 'feet' | 'miles';
    }
  ): Promise<{ min: number; max: number; mean: number; sum: number; count: number }> {
    const geojson = await this.loadGeoJSON(reference);
    const unit = options?.unit || 'meters';
    
    const perimeters: number[] = [];
    
    for (const feature of geojson.features) {
      const geomType = feature.geometry?.type;
      
      if (geomType === 'Polygon' || geomType === 'MultiPolygon' || 
          geomType === 'LineString' || geomType === 'MultiLineString') {
        try {
          // Calculate length using turf.length (returns kilometers)
          const lengthKm = (turf as any).length(feature);
          
          // Convert to requested unit
          let lengthValue = lengthKm * 1000; // Default to meters
          if (unit === 'kilometers') {
            lengthValue = lengthKm;
          } else if (unit === 'feet') {
            lengthValue = lengthKm * 3280.84;
          } else if (unit === 'miles') {
            lengthValue = lengthKm * 0.621371;
          }
          
          if (lengthValue > 0) {
            perimeters.push(lengthValue);
          }
        } catch (error) {
          console.warn('[VectorBackend] Failed to calculate perimeter for feature:', error);
        }
      }
    }
    
    if (perimeters.length === 0) {
      return { min: 0, max: 0, mean: 0, sum: 0, count: 0 };
    }
    
    const sum = perimeters.reduce((acc, val) => acc + val, 0);
    const min = Math.min(...perimeters);
    const max = Math.max(...perimeters);
    const mean = sum / perimeters.length;
    
    return { min, max, mean, sum, count: perimeters.length };
  }
}
