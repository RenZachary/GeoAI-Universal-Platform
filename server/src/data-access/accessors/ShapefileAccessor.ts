/**
 * ShapefileAccessor - Handles shapefile operations
 * 
 * Provides utilities for reading, writing, and converting shapefiles.
 * Uses GDAL's ogr2ogr for format conversions.
 */

import { promises as fs } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ShapefileAccessor {
  private workspaceBase: string;

  constructor(workspaceBase: string) {
    this.workspaceBase = workspaceBase;
  }

  /**
   * Load a shapefile and convert to GeoJSON
   */
  async loadGeoJSON(shpPath: string): Promise<any> {
    // Ensure the file exists
    await fs.access(shpPath);

    // Generate output GeoJSON path
    const outputDir = dirname(shpPath);
    const baseName = basename(shpPath, extname(shpPath));
    const geojsonPath = join(outputDir, `${baseName}.geojson`);

    try {
      // Use ogr2ogr to convert shapefile to GeoJSON
      const command = `ogr2ogr -f "GeoJSON" "${geojsonPath}" "${shpPath}"`;
      await execAsync(command);

      // Read and parse the GeoJSON
      const geojsonData = await fs.readFile(geojsonPath, 'utf-8');
      return JSON.parse(geojsonData);
    } catch (error) {
      console.error('[ShapefileAccessor] Error converting shapefile to GeoJSON:', error);
      throw new Error(`Failed to convert shapefile to GeoJSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save GeoJSON data to a file
   */
  async saveGeoJSON(data: any, name: string): Promise<string> {
    const outputPath = join(this.workspaceBase, 'temp', `${name}_${Date.now()}.geojson`);

    // Ensure temp directory exists
    await fs.mkdir(dirname(outputPath), { recursive: true });

    // Write GeoJSON to file
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');

    return outputPath;
  }

  /**
   * Get shapefile metadata (bounding box, feature count, etc.)
   */
  async getMetadata(shpPath: string): Promise<{
    featureCount: number;
    bbox: [number, number, number, number];
    fields: string[];
  }> {
    try {
      // Use ogrinfo to get metadata
      const command = `ogrinfo -so "${shpPath}"`;
      const { stdout } = await execAsync(command);

      // Parse ogrinfo output (simplified parsing)
      const featureCountMatch = stdout.match(/Feature Count:\s*(\d+)/);
      const extentMatch = stdout.match(/Extent:\s*\(([\d.-]+),\s*([\d.-]+)\)\s*-\s*\(([\d.-]+),\s*([\d.-]+)\)/);

      const featureCount = featureCountMatch ? parseInt(featureCountMatch[1]) : 0;
      const bbox: [number, number, number, number] = extentMatch
        ? [parseFloat(extentMatch[1]), parseFloat(extentMatch[2]), parseFloat(extentMatch[3]), parseFloat(extentMatch[4])]
        : [0, 0, 0, 0];

      // Extract field names (simplified)
      const fieldMatches = stdout.matchAll(/^(\w+)\s+\(/gm);
      const fields = Array.from(fieldMatches, match => match[1]);

      return { featureCount, bbox, fields };
    } catch (error) {
      console.error('[ShapefileAccessor] Error getting shapefile metadata:', error);
      throw new Error(`Failed to get shapefile metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
