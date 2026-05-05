/**
 * GeoJSON Accessor - Handles .geojson/.json file operations
 * Extends GeoJSONBasedAccessor for all spatial operations
 */

import fs from 'fs';
import path from 'path';
import type { NativeData, DataMetadata } from '../../core';
import { generateId } from '../../core';
import type { DataAccessor } from '../interfaces';
import { GeoJSONBasedAccessor, type GeoJSONFeatureCollection } from './impl/geojson/GeoJSONBasedAccessor';

export class GeoJSONAccessor extends GeoJSONBasedAccessor implements DataAccessor {
  readonly type = 'geojson' as const;

  constructor(workspaceBase?: string) {
    super(workspaceBase || process.cwd());
  }

  /**
   * Read GeoJSON file and return as NativeData
   */
  async read(reference: string): Promise<NativeData> {
    if (!fs.existsSync(reference)) {
      throw new Error(`GeoJSON file not found: ${reference}`);
    }
    
    const metadata = await this.getMetadata(reference);
    
    return {
      id: generateId(),
      type: 'geojson',
      reference,
      metadata,
      createdAt: new Date(),
    };
  }
  
  // ========================================================================
  // Abstract method implementations for GeoJSONBasedAccessor
  // ========================================================================

  protected async loadGeoJSON(reference: string): Promise<GeoJSONFeatureCollection> {
    const content = fs.readFileSync(reference, 'utf-8');
    const geojson = JSON.parse(content);
    
    if (!this.isValidGeoJSON(geojson)) {
      throw new Error('Invalid GeoJSON format');
    }
    
    // Ensure FeatureCollection
    if (geojson.type === 'Feature') {
      return {
        type: 'FeatureCollection',
        features: [geojson]
      };
    }
    
    return geojson;
  }

  protected async saveGeoJSON(geojson: GeoJSONFeatureCollection, hint?: string): Promise<string> {
    const workspaceDir = process.env.WORKSPACE_DIR || './workspace';
    const resultsDir = path.join(workspaceDir, 'results', 'geojson');
    
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const randomId = generateId().substring(0, 8);
    const filename = `${hint || 'geojson'}_${timestamp}_${randomId}.geojson`;
    const filepath = path.join(resultsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(geojson, null, 2));
    return filepath;
  }

  /**
   * Write GeoJSON data to file
   */
  async write(data: any, metadata?: Partial<DataMetadata>): Promise<string> {
    const resultPath = await this.saveGeoJSON(data, 'write');
    return resultPath;
  }
  
  /**
   * Delete GeoJSON file
   */
  async delete(reference: string): Promise<void> {
    try {
      fs.rmSync(reference, { force: true });
    } catch (error) {
      console.error(`Failed to delete GeoJSON file: ${reference}`, error);
      throw error;
    }
  }
  
  /**
   * Get GeoJSON metadata
   */
  async getMetadata(reference: string): Promise<DataMetadata> {
    const stats = fs.statSync(reference);
    const geojson = await this.loadGeoJSON(reference);
    
    // Use parent class's extractMetadata to get consistent format
    const baseMetadata = this.extractMetadata(geojson, reference);
    
    return {
      fileSize: stats.size,
      ...baseMetadata
    };
  }
  
  /**
   * Validate GeoJSON format
   */
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
      
      return this.isValidGeoJSON(geojson);
    } catch (error) {
      console.error('GeoJSON validation failed:', error);
      return false;
    }
  }
  
  /**
   * Check if object is valid GeoJSON
   */
  private isValidGeoJSON(obj: any): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }
    
    const validTypes = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 
                       'Polygon', 'MultiPolygon', 'GeometryCollection',
                       'Feature', 'FeatureCollection'];
    
    return validTypes.includes(obj.type);
  }
  
  /**
   * Count features in GeoJSON
   */
  private countFeatures(geojson: any): number {
    if (geojson.type === 'FeatureCollection') {
      return geojson.features?.length || 0;
    } else if (geojson.type === 'Feature') {
      return 1;
    }
    return 0;
  }
  
  /**
   * Extract field names from GeoJSON properties
   */
  private extractGeoJSONFields(geojson: any): string[] {
    const fields = new Set<string>();
    
    if (geojson.type === 'FeatureCollection' && geojson.features) {
      for (const feature of geojson.features) {
        if (feature.properties && typeof feature.properties === 'object') {
          Object.keys(feature.properties).forEach(key => fields.add(key));
        }
      }
    } else if (geojson.type === 'Feature' && geojson.properties) {
      Object.keys(geojson.properties).forEach(key => fields.add(key));
    }
    
    return Array.from(fields);
  }
}
