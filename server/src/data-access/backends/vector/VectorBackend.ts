/**
 * VectorBackend - Pure Turf.js implementation for vector data operations
 * 
 * Zero dependency on old accessor code.
 * Directly uses Turf.js for all spatial operations.
 */

import fs from 'fs';
import path from 'path';
import * as turf from '@turf/turf';
import type { NativeData, DataMetadata } from '../../../core';
import { generateId } from '../../../core';
import type { FilterCondition, BufferOptions } from '../../interfaces';
import type { DataBackend } from '../DataBackend';
import { BufferOperation } from './operations/BufferOperation';
import { OverlayOperation } from './operations/OverlayOperation';
import { FilterOperation } from './operations/FilterOperation';
import { AggregateOperation } from './operations/AggregateOperation';
import { SpatialJoinOperation } from './operations/SpatialJoinOperation';

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: any[];
  crs?: any;
}

export class VectorBackend implements DataBackend {
  readonly backendType = 'vector' as const;
  
  private workspaceBase: string;
  private bufferOp: BufferOperation;
  private overlayOp: OverlayOperation;
  private filterOp: FilterOperation;
  private aggregateOp: AggregateOperation;
  private spatialJoinOp: SpatialJoinOperation;
  
  constructor(workspaceBase?: string) {
    this.workspaceBase = workspaceBase || process.cwd();
    this.bufferOp = new BufferOperation();
    this.overlayOp = new OverlayOperation();
    this.filterOp = new FilterOperation();
    this.aggregateOp = new AggregateOperation();
    this.spatialJoinOp = new SpatialJoinOperation();
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
    const geojson = await this.loadGeoJSON(reference);
    const result = await this.filterOp.execute(geojson, filterCondition);
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
    
    return {
      id: generateId(),
      type: 'geojson',
      reference: outputPath,
      metadata: {
        result: outputPath,
        description: `Aggregation ${aggFunc} on field ${field}`,
        featureCount: returnFeature ? 1 : 0
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
  
  private async loadGeoJSON(reference: string): Promise<GeoJSONFeatureCollection> {
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
   * Load a shapefile and convert to GeoJSON using ogr2ogr
   */
  private async loadShapefileAsGeoJSON(shpPath: string): Promise<GeoJSONFeatureCollection> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Generate temporary GeoJSON path
    const outputDir = path.dirname(shpPath);
    const baseName = path.basename(shpPath, '.shp');
    const tempGeojsonPath = path.join(outputDir, `${baseName}_temp_${Date.now()}.geojson`);
    
    try {
      // Use ogr2ogr to convert shapefile to GeoJSON
      const command = `ogr2ogr -f "GeoJSON" "${tempGeojsonPath}" "${shpPath}"`;
      await execAsync(command);
      
      // Read and parse the GeoJSON
      const geojsonData = fs.readFileSync(tempGeojsonPath, 'utf-8');
      const geojson = JSON.parse(geojsonData);
      
      // Clean up temporary file
      fs.unlinkSync(tempGeojsonPath);
      
      // Ensure it's a FeatureCollection
      if (geojson.type === 'Feature') {
        return {
          type: 'FeatureCollection',
          features: [geojson]
        };
      }
      
      if (geojson.type !== 'FeatureCollection') {
        throw new Error('Invalid GeoJSON format after shapefile conversion');
      }
      
      return geojson;
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(tempGeojsonPath)) {
        fs.unlinkSync(tempGeojsonPath);
      }
      
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to convert shapefile to GeoJSON: ${message}`);
    }
  }
  
  private async saveGeoJSON(geojson: GeoJSONFeatureCollection): Promise<string> {
    const workspaceDir = process.env.WORKSPACE_DIR || './workspace';
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
  
  private extractMetadata(geojson: GeoJSONFeatureCollection, reference: string): DataMetadata {
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
  
  private extractCRS(_geojson: GeoJSONFeatureCollection): string {
    return 'EPSG:4326';
  }
  
  private calculateBbox(geojson: GeoJSONFeatureCollection): [number, number, number, number] | null {
    try {
      const bbox = (turf as any).bbox(geojson);
      return bbox ? [bbox[0], bbox[1], bbox[2], bbox[3]] : null;
    } catch {
      return null;
    }
  }
  
  private extractFields(geojson: GeoJSONFeatureCollection): any[] {
    if (geojson.features.length === 0) return [];
    
    const firstFeature = geojson.features[0];
    const properties = firstFeature.properties || {};
    
    return Object.keys(properties).map(key => ({
      name: key,
      type: typeof properties[key]
    }));
  }
  
  private extractSampleValues(geojson: GeoJSONFeatureCollection): Record<string, any[]> {
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
}
