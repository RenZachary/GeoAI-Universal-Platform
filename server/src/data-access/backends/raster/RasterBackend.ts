/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RasterBackend - Handles raster data operations using geotiff.js
 */

import fs from 'fs';
import path from 'path';
import { fromFile } from 'geotiff';
import type { NativeData, DataMetadata } from '../../../core';
import { generateId } from '../../../core';
import type { DataBackend } from '../DataBackend';

export class RasterBackend implements DataBackend {
  readonly backendType = 'raster' as const;
  
  canHandle(dataSourceType: string, reference: string): boolean {
    const ext = path.extname(reference).toLowerCase();
    return dataSourceType === 'tif' || ext === '.tif' || ext === '.tiff';
  }
  
  // All spatial operations throw errors (not supported for raster)
  async buffer(): Promise<any> { throw new Error('Buffer not supported for raster'); }
  async overlay(): Promise<any> { throw new Error('Overlay not supported for raster'); }
  async filter(): Promise<any> { throw new Error('Filter not supported for raster'); }
  async aggregate(): Promise<any> { throw new Error('Aggregate not implemented for raster'); }
  async spatialJoin(): Promise<any> { throw new Error('Spatial join not supported for raster'); }
  async choropleth(): Promise<any> { throw new Error('Choropleth not applicable for raster'); }
  async heatmap(): Promise<any> { throw new Error('Heatmap requires specialized processing'); }
  async categorical(): Promise<any> { throw new Error('Categorical not implemented for raster'); }
  async uniformColor(): Promise<any> { throw new Error('Uniform color is rendering concern'); }
  
  async read(reference: string): Promise<NativeData> {
    if (!fs.existsSync(reference)) {
      throw new Error(`Raster file not found: ${reference}`);
    }
    
    const tiff = await fromFile(reference);
    const image = await tiff.getImage();
    const metadata = await this.extractMetadata(tiff, image, reference);
    
    return {
      id: generateId(),
      type: 'tif',
      reference,
      metadata: { ...metadata, result: null, description: 'Raster data loaded' },
      createdAt: new Date()
    };
  }
  
  async write(): Promise<string> { throw new Error('Raster write not implemented'); }
  
  async delete(reference: string): Promise<void> {
    fs.rmSync(reference, { force: true });
  }
  
  async getMetadata(reference: string): Promise<any> {
    const tiff = await fromFile(reference);
    const image = await tiff.getImage();
    return this.extractMetadata(tiff, image, reference);
  }
  
  async validate(reference: string): Promise<boolean> {
    try {
      if (!fs.existsSync(reference)) return false;
      const ext = path.extname(reference).toLowerCase();
      if (!['.tif', '.tiff'].includes(ext)) return false;
      await fromFile(reference);
      return true;
    } catch {
      return false;
    }
  }
  
  private async extractMetadata(_tiff: any, image: any, filePath: string): Promise<DataMetadata> {
    const stats = fs.statSync(filePath);
    const width = image.getWidth();
    const height = image.getHeight();
    const origin = image.getOrigin();
    const resolution = image.getResolution();
    
    const minX = origin[0];
    const maxY = origin[1];
    const maxX = minX + (width * Math.abs(resolution[0]));
    const minY = maxY - (height * Math.abs(resolution[1]));
    
    return {
      fileSize: stats.size,
      width,
      height,
      bandCount: image.getSamplesPerPixel(),
      resolution: { x: Math.abs(resolution[0]), y: Math.abs(resolution[1]) },
      bbox: [minX, minY, maxX, maxY] as [number, number, number, number],
      crs: 'EPSG:4326',
      dataType: 'raster'
    };
  }
  
  async getSchema(_reference: string): Promise<any> {
    // For raster backends, schema is not applicable
    // Raster data has bands/pixels, not tabular schema
    throw new Error('Schema extraction not applicable for raster data');
  }
  
  // Statistical operations not applicable for raster data
  async getUniqueValues(_reference: string, _fieldName: string): Promise<string[]> {
    throw new Error('getUniqueValues not applicable for raster data');
  }
  
  async getFieldStatistics(_reference: string, _fieldName: string): Promise<any> {
    throw new Error('getFieldStatistics not applicable for raster data');
  }
  
  async getClassificationBreaks(
    _reference: string,
    _fieldName: string,
    _method: 'quantile' | 'equal_interval' | 'jenks' | 'standard_deviation',
    _numClasses?: number
  ): Promise<number[]> {
    throw new Error('getClassificationBreaks not applicable for raster data');
  }
  
  // Proximity operations not supported for raster data
  async calculateDistance(): Promise<any> {
    throw new Error('calculateDistance not supported for raster data');
  }
  
  async findNearestNeighbors(): Promise<any> {
    throw new Error('findNearestNeighbors not supported for raster data');
  }
  
  async filterByDistance(): Promise<any> {
    throw new Error('filterByDistance not supported for raster data');
  }
}
