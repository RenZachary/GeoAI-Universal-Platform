/**
 * Data Source Type Detector
 * Detects data source format from file path or magic bytes
 * 
 * This utility centralizes format detection logic used across the system.
 */

import path from 'path';
import fs from 'fs';
import type { DataSourceType } from '../../core';

export class DataSourceDetector {
  /**
   * Detect data source type from file path
   * Uses file extension as primary indicator
   */
  static detectFromPath(filePath: string): DataSourceType {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.geojson':
      case '.json':
        return 'geojson';
      
      case '.shp':
        return 'shapefile';
      
      case '.gpkg':
        return 'postgis'; // GeoPackage uses SQLite/PostGIS
      
      case '.kml':
        return 'geojson'; // TODO: KML conversion needed
      
      case '.csv':
        return 'geojson'; // TODO: CSV with coords conversion
      
      default:
        // Try to detect from content for unknown extensions
        return this.detectFromContent(filePath);
    }
  }
  
  /**
   * Detect data source type from file content (magic bytes)
   */
  static detectFromContent(filePath: string): DataSourceType {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      // Read first few bytes for magic number detection
      const buffer = Buffer.alloc(16);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);
      
      // Shapefile magic number: 9994 (big-endian)
      if (buffer[0] === 0x00 && buffer[1] === 0x00 && 
          buffer[2] === 0x27 && buffer[3] === 0x0A) {
        return 'shapefile';
      }
      
      // GeoPackage (SQLite) magic: "SQLite format 3"
      const sqliteMagic = Buffer.from('SQLite format 3');
      if (buffer.slice(0, 15).toString() === sqliteMagic.toString()) {
        return 'postgis'; // GeoPackage
      }
      
      // Try parsing as JSON for GeoJSON
      try {
        const content = fs.readFileSync(filePath, 'utf-8').substring(0, 1000);
        const parsed = JSON.parse(content);
        if (parsed.type && ['Feature', 'FeatureCollection'].includes(parsed.type)) {
          return 'geojson';
        }
      } catch {
        // Not JSON
      }
      
      // Default to GEOJSON for unknown types
      console.warn(`[DataSourceDetector] Could not detect format for: ${filePath}, assuming GeoJSON`);
      return 'geojson';
      
    } catch (error) {
      console.error('[DataSourceDetector] Detection failed:', error);
      return 'geojson'; // Fallback
    }
  }
  
  /**
   * Get list of supported file extensions
   */
  static getSupportedExtensions(): string[] {
    return [
      '.geojson', '.json',  // GeoJSON
      '.shp', '.shx', '.dbf', '.prj',  // Shapefile components
      '.gpkg',  // GeoPackage
      '.kml', '.kmz',  // KML
      '.csv',  // CSV with coordinates
    ];
  }
}
