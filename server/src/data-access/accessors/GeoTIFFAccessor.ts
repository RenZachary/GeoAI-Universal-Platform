/**
 * GeoTIFF Accessor - Handles raster TIFF file operations
 * 
 * Uses geotiff.js library to read raster metadata including:
 * - CRS/projection
 * - Extent/bbox
 * - Resolution
 * - Band count and statistics
 */

import fs from 'fs';
import { fromFile, type GeoTIFF } from 'geotiff';
import type { NativeData, DataMetadata } from '../../core';
import { generateId, wrapError } from '../../core';
import type { BufferOptions, FileAccessor, OverlayOptions, FilterCondition } from '../interfaces';

export class GeoTIFFAccessor implements FileAccessor {
  buffer(_reference: string, _distance: number, _options?: BufferOptions): Promise<NativeData> {
    throw new Error('Buffering is not supported for GeoTIFF files.');
  }
  overlay(_reference1: string, _reference2: string, _options: OverlayOptions): Promise<NativeData> {
    throw new Error('Overlay operation is not supported for GeoTIFF files.');
  }
  filter(_reference: string, _filterCondition: FilterCondition): Promise<NativeData> {
    throw new Error('Filtering is not supported for raster GeoTIFF files.');
  }
  aggregate(_reference: string, _aggFunc: string, _field: string, _returnFeature?: boolean): Promise<NativeData> {
    throw new Error('Aggregation is not supported for raster GeoTIFF files.');
  }
  spatialJoin(_targetReference: string, _joinReference: string, _operation: string, _joinType?: string): Promise<NativeData> {
    throw new Error('Spatial join is not supported for raster GeoTIFF files.');
  }
  readonly type = 'tif' as const;
  
  /**
   * Read GeoTIFF file and return metadata (not pixel data)
   */
  async read(reference: string): Promise<NativeData> {
    // Validate file exists
    if (!fs.existsSync(reference)) {
      throw new Error(`GeoTIFF file not found: ${reference}`);
    }
    
    try {
      console.log(`[GeoTIFFAccessor] Reading GeoTIFF: ${reference}`);
      
      // Open GeoTIFF file
      const tiff = await fromFile(reference);
      
      // Get first image (main resolution level)
      const image = await tiff.getImage();
      
      // Extract metadata
      const metadata = await this.extractMetadata(tiff, image, reference);
      
      console.log(`[GeoTIFFAccessor] Successfully read GeoTIFF metadata:`, {
        crs: metadata.crs,
        bbox: metadata.bbox,
        width: metadata.width,
        height: metadata.height,
        bands: metadata.bandCount
      });
      
      return {
        id: generateId(),
        type: 'tif',
        reference,
        metadata: {
          ...metadata,
          // StandardizedOutput fields for data source (no computation result)
          result: null, // Data source has no computation result
          description: 'GeoTIFF data source loaded successfully'
        },
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('[GeoTIFFAccessor] Failed to read GeoTIFF:', error);
      throw wrapError(error, 'Failed to read GeoTIFF');
    }
  }
  
  /**
   * Write GeoTIFF data to file
   */
  async write(_data: any, _metadata?: Partial<DataMetadata>): Promise<string> {
    // TODO: Implement raster writing with gdal
    throw new Error('GeoTIFF write operation not yet implemented');
  }
  
  /**
   * Delete GeoTIFF file
   */
  async delete(reference: string): Promise<void> {
    try {
      fs.rmSync(reference, { force: true });
    } catch (error) {
      console.error(`Failed to delete GeoTIFF file: ${reference}`, error);
      throw error;
    }
  }
  
  /**
   * Get GeoTIFF metadata
   */
  async getMetadata(reference: string): Promise<DataMetadata> {
    try {
      const tiff = await fromFile(reference);
      const image = await tiff.getImage();
      return await this.extractMetadata(tiff, image, reference);
    } catch (error) {
      console.error('[GeoTIFFAccessor] Failed to get metadata:', error);
      throw error;
    }
  }
  
  /**
   * Extract comprehensive metadata from GeoTIFF
   */
  private async extractMetadata(
    _tiff: GeoTIFF,
    image: any,
    filePath: string
  ): Promise<DataMetadata> {
    const stats = fs.statSync(filePath);
    
    // Get dimensions
    const width = image.getWidth();
    const height = image.getHeight();
    
    // Get geospatial info
    const origin = image.getOrigin();
    const resolution = image.getResolution();
    
    // Calculate bounding box
    const minX = origin[0];
    const maxY = origin[1];
    const maxX = minX + (width * Math.abs(resolution[0]));
    const minY = maxY - (height * Math.abs(resolution[1]));
    
    // Get band information
    const bandCount = image.getSamplesPerPixel();
    
    // Try to extract CRS
    let crs = 'EPSG:4326'; // Default
    try {
      const geoKeys = image.geoKeys || {};
      if (geoKeys.GeographicTypeGeoKey) {
        crs = `EPSG:${geoKeys.GeographicTypeGeoKey}`;
      } else if (geoKeys.ProjectedCSTypeGeoKey) {
        crs = `EPSG:${geoKeys.ProjectedCSTypeGeoKey}`;
      }
    } catch (error) {
      console.warn('[GeoTIFFAccessor] Could not extract CRS, using default EPSG:4326');
    }
    
    return {
      fileSize: stats.size,
      crs,
      bbox: [minX, minY, maxX, maxY] as [number, number, number, number],
      width,
      height,
      resolution: Math.abs(resolution[0]),
      bandCount,
      origin: [origin[0], origin[1]],
      dataType: this.getDataTypeName(image.getSampleFormat()),
      noDataValue: image.getGDALNoData()
    };
  }
  
  /**
   * Convert GDAL sample format to human-readable name
   */
  private getDataTypeName(sampleFormat: number): string {
    switch (sampleFormat) {
      case 1: return 'UInt8';
      case 2: return 'Int16';
      case 3: return 'UInt16';
      case 4: return 'Int32';
      case 5: return 'UInt32';
      case 6: return 'Float32';
      case 7: return 'Float64';
      default: return 'Unknown';
    }
  }
  
  /**
   * Validate GeoTIFF format
   */
  async validate(reference: string): Promise<boolean> {
    try {
      if (!fs.existsSync(reference)) {
        return false;
      }
      
      // Check extension
      const ext = reference.toLowerCase();
      if (!ext.endsWith('.tif') && !ext.endsWith('.tiff')) {
        return false;
      }
      
      // TODO: Verify TIFF header signature
      // const buffer = Buffer.alloc(4);
      // const fd = fs.openSync(reference, 'r');
      // fs.readSync(fd, buffer, 0, 4, 0);
      // fs.closeSync(fd);
      // return buffer[0] === 0x49 && buffer[1] === 0x49; // Little-endian TIFF
      
      return true; // Placeholder
    } catch (error) {
      console.error('GeoTIFF validation failed:', error);
      return false;
    }
  }
  
  /**
   * Get unique values for a field (not applicable for raster data)
   */
  async getUniqueValues(_reference: string, _fieldName: string): Promise<string[]> {
    throw new Error('getUniqueValues is not supported for raster GeoTIFF files');
  }
  
  /**
   * Check if file exists
   */
  async exists(reference: string): Promise<boolean> {
    return fs.existsSync(reference);
  }
  
  /**
   * Get file size in bytes
   */
  async getFileSize(reference: string): Promise<number> {
    const stats = fs.statSync(reference);
    return stats.size;
  }
  
  /**
   * Get file modification time
   */
  async getModifiedTime(reference: string): Promise<Date> {
    const stats = fs.statSync(reference);
    return stats.mtime;
  }
}
