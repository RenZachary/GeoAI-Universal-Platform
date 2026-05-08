/**
 * Shapefile Accessor - Handles .shp file operations
 * Extends GeoJSONBasedAccessor for all spatial operations
 */

import fs from 'fs';
import path from 'path';
import type { NativeData, DataMetadata, FieldInfo } from '../../core';
import { generateId } from '../../core';
import type { DataAccessor } from '../interfaces';
import * as shapefile from 'shapefile';
import { DBFFile } from 'dbffile';
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
      metadata: {
        ...metadata,
        // StandardizedOutput fields - for data reading, result is the file reference
        result: reference,
        description: `Shapefile data source: ${path.basename(reference)}`
      },
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
    
    // If hint is provided and looks like a UUID, use it as filename for consistency
    // Otherwise generate a new ID
    const fileId = (hint && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hint)) 
      ? hint 
      : generateId();
    const filename = `${fileId}.geojson`;
    const filepath = path.join(resultsDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(geojson, null, 2), 'utf-8');
    return filepath;
  }

  /**
   * Write shapefile data (copy to workspace)
   */
  async write(_data: unknown, _metadata?: Partial<DataMetadata>): Promise<string> {
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
    
    // Extract fields from DBF header (precise type information)
    let fields: FieldInfo[] = [];
    if (fs.existsSync(dbfPath)) {
      try {
        const dbf = await DBFFile.open(dbfPath);
        fields = dbf.fields.map(field => ({
          name: field.name.trim(),
          type: this.mapDBFTypeToUnified(field.type, field.decimalPlaces || 0)
        }));
      } catch (error) {
        console.warn(`[ShapefileAccessor] Failed to read DBF header for ${reference}:`, error instanceof Error ? error.message : 'Unknown error');
        // DBF read failure - return empty fields array
      }
    }
    
    // Read shapefile to extract feature count and geometry type
    let featureCount = 0;
    let geometryType: string | undefined;
    
    try {
      const source = await shapefile.open(reference.replace('.shp', ''));
      let result;
      
      while (!(result = await source.read()).done) {
        featureCount++;
        
        // Detect geometry type from first feature
        if (!geometryType && result.value?.geometry?.type) {
          geometryType = result.value.geometry.type;
        }
      }
    } catch (error) {
      console.warn(`[ShapefileAccessor] Failed to read shapefile features:`, error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Extract CRS from PRJ file
    const crs = fs.existsSync(prjPath) 
      ? this.extractCRSFromPRJ(prjPath)
      : undefined;
    
    return {
      fileSize: totalSize,
      crs,
      featureCount,
      geometryType,
      fields  // Unified format: FieldInfo[]
    };
  }
  
  /**
   * Map DBF field types to unified type system
   */
  private mapDBFTypeToUnified(dbfType: string, decimals: number): string {
    switch (dbfType) {
      case 'C': // Character
      case 'M': // Memo
        return 'string';
      case 'N': // Numeric
        // Has decimal places -> float, otherwise integer (both map to 'number')
        return 'number';
      case 'D': // Date
        return 'date';
      case 'L': // Logical
        return 'boolean';
      default:
        console.warn(`[ShapefileAccessor] Unknown DBF type: ${dbfType}, defaulting to string`);
        return 'string';
    }
  }
  
  /**
   * Extract CRS from PRJ file by parsing WKT
   */
  private extractCRSFromPRJ(prjPath: string): string | undefined {
    try {
      const wkt = fs.readFileSync(prjPath, 'utf-8').trim();
      
      // Try to extract EPSG code from AUTHORITY["EPSG","XXXX"]
      const epsgMatch = wkt.match(/AUTHORITY\["EPSG",["']?(\d+)["']?\]/i);
      if (epsgMatch) {
        return `EPSG:${epsgMatch[1]}`;
      }
      
      // Fallback: recognize common projections
      if (wkt.includes('WGS_1984') || wkt.includes('WGS84')) {
        return 'EPSG:4326';
      }
      
      return undefined;
    } catch (error) {
      console.warn(`[ShapefileAccessor] Failed to parse PRJ file:`, error instanceof Error ? error.message : 'Unknown error');
      return undefined;
    }
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
  
  /**
   * Get unique values for a specific field (for categorical rendering)
   */
  async getUniqueValues(reference: string, fieldName: string): Promise<string[]> {
    const source = await shapefile.open(reference.replace('.shp', ''));
    const uniqueValues = new Set<string>();
    
    // Read all features and extract unique values
    let result;
    while (!(result = await source.read()).done) {
      if (result.value && result.value.properties) {
        const value = (result.value.properties as any)[fieldName];
        if (value !== undefined && value !== null) {
          uniqueValues.add(String(value));
        }
      }
    }
    
    return Array.from(uniqueValues).sort();
  }
}
