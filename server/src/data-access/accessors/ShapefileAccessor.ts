/**
 * Shapefile Accessor - Handles .shp file operations
 * Extends GeoJSONBasedAccessor for all spatial operations
 */

import fs from 'fs';
import path from 'path';
import type { NativeData, DataMetadata } from '../../core';
import { generateId } from '../../core';
import type { DataAccessor } from '../interfaces';
import * as shapefile from 'shapefile';
import { GeoJSONBasedAccessor, type GeoJSONFeatureCollection } from './impl/geojson/GeoJSONBasedAccessor';

export class ShapefileAccessor extends GeoJSONBasedAccessor implements DataAccessor {
  readonly type = 'shapefile' as const;

  constructor(workspaceBase: string) {
    super(workspaceBase);
  }
  
  // All required DataAccessor methods are inherited from GeoJSONBasedAccessor:
  // - read(), write(), delete(), getMetadata(), validate()
  // - buffer(), overlay(), filter(), spatialJoin()

  /**
   * Read shapefile and return as NativeData
   */
  async read(reference: string): Promise<NativeData> {
    if (!fs.existsSync(reference)) {
      throw new Error(`Shapefile not found: ${reference}`);
    }
    
    const metadata = await this.getMetadata(reference);
    
    return {
      id: generateId(),
      type: 'shapefile',
      reference,
      metadata,
      createdAt: new Date(),
    };
  }
  
  // ========================================================================
  // Abstract method implementations for GeoJSONBasedAccessor
  // ========================================================================

  protected async loadGeoJSON(reference: string): Promise<GeoJSONFeatureCollection> {
    const source = await shapefile.open(reference.replace('.shp', ''));
    
    // Read all features from the shapefile
    const features = [];
    let result;
    
    while (!(result = await source.read()).done) {
      if (result.value) {
        features.push(result.value);
      }
    }
    
    // Return as FeatureCollection
    return {
      type: 'FeatureCollection',
      features: features
    };
  }

  protected async saveGeoJSON(geojson: GeoJSONFeatureCollection, hint?: string): Promise<string> {
    const resultsDir = path.join(this.workspaceBase, 'results', 'geojson');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const filename = `${hint || 'shapefile'}_${Date.now()}.geojson`;
    const filepath = path.join(resultsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(geojson, null, 2), 'utf-8');
    return filepath;
  }

  /**
   * Write shapefile data (copy to workspace)
   */
  async write(data: any, metadata?: Partial<DataMetadata>): Promise<string> {
    throw new Error('Shapefile write operation not yet implemented');
  }
  
  /**
   * Delete shapefile
   */
  async delete(reference: string): Promise<void> {
    try {
      fs.rmSync(reference, { force: true });
    } catch (error) {
      console.error(`Failed to delete shapefile: ${reference}`, error);
      throw error;
    }
  }
  
  /**
   * Get shapefile metadata
   */
  async getMetadata(reference: string): Promise<DataMetadata> {
    const stats = fs.statSync(reference);
    const baseName = path.basename(reference, path.extname(reference));
    const dir = path.dirname(reference);
    
    const shxPath = path.join(dir, `${baseName}.shx`);
    const dbfPath = path.join(dir, `${baseName}.dbf`);
    const prjPath = path.join(dir, `${baseName}.prj`);
    
    // Calculate total size of all shapefile components
    let totalSize = stats.size;
    if (fs.existsSync(shxPath)) totalSize += fs.statSync(shxPath).size;
    if (fs.existsSync(dbfPath)) totalSize += fs.statSync(dbfPath).size;
    if (fs.existsSync(prjPath)) totalSize += fs.statSync(prjPath).size;
    
    // Read shapefile to extract feature count and fields
    let featureCount = 0;
    const fieldSet = new Set<string>();
    
    try {
      const source = await shapefile.open(reference.replace('.shp', ''));
      
      // Read all features to count and extract fields
      let feature;
      
      while (!(feature = await source.read()).done) {
        featureCount++;
        
        // Collect field names from properties
        if (feature.value && feature.value.properties) {
          Object.keys(feature.value.properties).forEach(key => {
            fieldSet.add(key);
          });
        }
      }
      
    } catch (error) {
      console.warn(`Failed to read shapefile for metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Continue with basic metadata if reading fails
    }
    
    const metadata: DataMetadata = {
      fileSize: totalSize,
      crs: fs.existsSync(prjPath) ? 'EPSG:4326' : undefined,
      featureCount,
      fields: Array.from(fieldSet)
    };
    
    return metadata;
  }
  
  /**
   * Validate shapefile format
   */
  async validate(reference: string): Promise<boolean> {
    try {
      if (!fs.existsSync(reference)) return false;
      if (!reference.toLowerCase().endsWith('.shp')) return false;
      
      const stats = fs.statSync(reference);
      return stats.size > 0;
    } catch (error) {
      console.error('Shapefile validation failed:', error);
      return false;
    }
  }
}
