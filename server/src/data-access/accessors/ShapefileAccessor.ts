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
    const baseName = path.basename(reference, '.shp');
    const source = await shapefile.open(reference.replace('.shp', ''));
    return await source.read();
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
    
    const metadata: DataMetadata = {
      fileSize: stats.size,
      crs: fs.existsSync(prjPath) ? 'EPSG:4326' : undefined,
      bbox: undefined,
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
