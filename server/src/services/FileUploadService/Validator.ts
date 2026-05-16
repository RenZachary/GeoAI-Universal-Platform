import { ValidationError, FormatError } from './errors';
import { SUPPORTED_EXTENSIONS } from './constant';
import fs from 'fs';
import path from 'path';
import type { DataSourceType } from '../../core';

export class FileUploadValidator {
  detectDataSourceType(fileName: string): DataSourceType {
    const ext = this.getFileExtension(fileName);

    if (SUPPORTED_EXTENSIONS.GEOJSON.includes(ext)) {
      return 'geojson';
    } else if (SUPPORTED_EXTENSIONS.SHAPEFILE.includes(ext)) {
      return 'shapefile';
    } else if (SUPPORTED_EXTENSIONS.TIF.includes(ext)) {
      return 'tif';
    } else if (SUPPORTED_EXTENSIONS.CSV.includes(ext)) {
      return 'geojson';
    } else if (['.shx', '.dbf', '.prj'].includes(ext)) {
      throw new FormatError(
        `File '${fileName}' is a Shapefile component. ` +
        `Shapefile components (.shp, .shx, .dbf, .prj) must be uploaded together using the multiple file upload endpoint.`
      );
    } else {
      throw new FormatError(`Unsupported file format: ${ext}. Supported formats: .geojson, .shp, .tif, .csv`);
    }
  }

  validateGeoJSON(content: string): void {
    try {
      const geojson = JSON.parse(content);
      
      if (!geojson.type || !['Feature', 'FeatureCollection'].includes(geojson.type)) {
        throw new ValidationError('Invalid GeoJSON: missing or invalid type field');
      }
      
      if (geojson.type === 'Feature' && !geojson.geometry) {
        throw new ValidationError('Invalid GeoJSON Feature: missing geometry');
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError('Invalid GeoJSON: failed to parse JSON');
    }
  }

  validateGeoTIFF(buffer: Buffer): void {
    if (buffer.length < 4) {
      throw new ValidationError('Invalid TIFF file: file too small');
    }
    
    const isLittleEndian = buffer[0] === 0x49 && buffer[1] === 0x49;
    const isBigEndian = buffer[0] === 0x4D && buffer[1] === 0x4D;
    
    if (!isLittleEndian && !isBigEndian) {
      throw new ValidationError('Invalid TIFF file: incorrect magic number');
    }
  }

  validateShapefileComponents(files: Array<{ originalname: string; path: string }>): Record<string, string> {
    const components: Record<string, string> = {};

    for (const file of files) {
      const ext = this.getFileExtension(file.originalname);

      if (ext === '.shp') {
        components.shp = file.path;
      } else if (ext === '.shx') {
        components.shx = file.path;
      } else if (ext === '.dbf') {
        components.dbf = file.path;
      } else if (ext === '.prj') {
        components.prj = file.path;
      }
    }

    if (!components.shp) {
      throw new ValidationError('Shapefile upload must include .shp file');
    }

    return components;
  }

  validateShapefileComplete(shpPath: string): void {
    const baseName = shpPath.replace(/\.shp$/i, '');
    const requiredFiles = [
      `${baseName}.shp`,
      `${baseName}.shx`,
      `${baseName}.dbf`
    ];

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));

    if (missingFiles.length > 0) {
      throw new ValidationError(`Incomplete shapefile. Missing components: ${missingFiles.map(f => path.basename(f)).join(', ')}`);
    }
  }

  private getFileExtension(fileName: string): string {
    return path.extname(fileName).toLowerCase();
  }
}
