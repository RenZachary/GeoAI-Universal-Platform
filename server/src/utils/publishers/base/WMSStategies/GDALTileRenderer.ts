/**
 * GDAL Tile Renderer - Utility functions for GDAL-based tile rendering
 * 
 * Provides common GDAL operations:
 * - Metadata extraction using gdalinfo
 * - Tile rendering using gdalwarp + gdal_translate
 * - Path resolution for GDAL executables
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

// ============================================================================
// GDAL Executable Resolution
// ============================================================================

// Get GDAL executable paths from environment or use system PATH
const GDAL_DIR = process.env.GDAL_DIR;

/**
 * Get the full path to a GDAL executable
 * @param name - Executable name (e.g., 'gdalwarp.exe')
 * @returns Quoted path to executable or just the name for system PATH lookup
 */
export function getGdalExecutable(name: string): string {
  if (GDAL_DIR) {
    // Try both GDAL_DIR/bin and GDAL_DIR directly
    const possiblePaths = [
      path.join(GDAL_DIR, 'bin', name),  // Standard structure with bin/ subfolder
      path.join(GDAL_DIR, name)           // Flat structure (like C:\Program Files\GDAL)
    ];
    
    for (const gdalPath of possiblePaths) {
      if (fs.existsSync(gdalPath)) {
        return `"${gdalPath}"`;
      }
    }
    
    console.warn(`[GDAL Renderer] GDAL executable '${name}' not found in GDAL_DIR: ${GDAL_DIR}`);
  }
  
  // Fallback to system PATH
  return name;
}

// ============================================================================
// Coordinate Transformation Utilities
// ============================================================================

/**
 * Transform bounding box from one CRS to another using gdaltransform
 * @param bbox - Bounding box [minX, minY, maxX, maxY]
 * @param sourceSRS - Source coordinate system (e.g., 'EPSG:4326')
 * @param targetSRS - Target coordinate system (e.g., 'EPSG:3857')
 * @returns Transformed bounding box
 */
export async function transformBbox(
  bbox: [number, number, number, number],
  sourceSRS: string,
  targetSRS: string
): Promise<[number, number, number, number]> {
  if (sourceSRS === targetSRS) {
    return bbox; // No transformation needed
  }
  
  const [minX, minY, maxX, maxY] = bbox;
  
  try {
    // Use gdaltransform to convert corner coordinates
    const gdaltransform = getGdalExecutable('gdaltransform.exe');
    
    // Transform all four corners by piping input
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const proc = spawn(gdaltransform.replace(/"/g, ''), [`-s_srs`, sourceSRS, `-t_srs`, targetSRS]);
      let output = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        console.error('[GDAL Renderer] gdaltransform stderr:', data.toString());
      });
      
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`gdaltransform exited with code ${code}`));
          return;
        }
        
        try {
          const lines = output.trim().split('\n').filter(l => l.trim());
          if (lines.length < 4) {
            reject(new Error(`gdaltransform returned insufficient output`));
            return;
          }
          
          // Parse transformed coordinates
          const coords = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            return [parseFloat(parts[0]), parseFloat(parts[1])];
          });
          
          // Calculate bounding box from transformed corners
          const xs = coords.map(c => c[0]);
          const ys = coords.map(c => c[1]);
          
          resolve([
            Math.min(...xs),
            Math.min(...ys),
            Math.max(...xs),
            Math.max(...ys)
          ]);
        } catch (error) {
          reject(error);
        }
      });
      
      // Write input coordinates
      proc.stdin.write(`${minX} ${minY}\n`);
      proc.stdin.write(`${maxX} ${minY}\n`);
      proc.stdin.write(`${maxX} ${maxY}\n`);
      proc.stdin.write(`${minX} ${maxY}\n`);
      proc.stdin.end();
    });
  } catch (error: any) {
    console.error('[GDAL Renderer] Failed to transform bbox:', error.message);
    throw error;
  }
}

// ============================================================================
// GeoTIFF Metadata Extraction
// ============================================================================

export interface GeoTIFFMetadata {
  width: number;
  height: number;
  bbox: [number, number, number, number];  // [minX, minY, maxX, maxY]
  srs: string;  // e.g., 'EPSG:4326'
  origin: [number, number];
  pixelSize: [number, number];
  resolution: [number, number];
}

/**
 * Extract metadata from a GeoTIFF file using gdalinfo
 * @param filePath - Path to GeoTIFF file
 * @returns Parsed metadata object
 */
export async function extractGeoTIFFMetadata(filePath: string): Promise<GeoTIFFMetadata> {
  const gdalinfo = getGdalExecutable('gdalinfo.exe');
  
  try {
    const { stdout: gdalInfoOutput } = await execAsync(`${gdalinfo} -json "${filePath}"`);
    const gdalInfo = JSON.parse(gdalInfoOutput);
    
    // Extract dimensions
    const width = gdalInfo.size[0];
    const height = gdalInfo.size[1];
    
    // Extract coordinate system
    const crsWkt = gdalInfo.coordinateSystem?.wkt;
    let srs = 'EPSG:4326'; // Default
    if (crsWkt) {
      // Try to extract EPSG code from WKT
      const epsgMatch = crsWkt.match(/EPSG["']?[:"]?(\d+)/i);
      if (epsgMatch) {
        srs = `EPSG:${epsgMatch[1]}`;
      }
    }
    
    // Extract geotransform [originX, pixelWidth, rotationX, originY, rotationY, pixelHeight]
    const geoTransform = gdalInfo.geoTransform;
    if (!geoTransform || geoTransform.length !== 6) {
      throw new Error('No valid GeoTransform found in GeoTIFF');
    }
    
    const [originX, pixelWidth, , originY, , pixelHeight] = geoTransform;
    
    // Calculate bounding box
    // For standard GeoTIFF with top-left origin:
    // - pixelWidth > 0 (eastward)
    // - pixelHeight < 0 (southward, because image Y increases downward)
    const minX = originX;
    const maxX = originX + (width * pixelWidth);
    
    let minY: number, maxY: number;
    if (pixelHeight < 0) {
      // Standard case: origin is top-left corner
      maxY = originY;
      minY = originY + (height * pixelHeight); // pixelHeight is negative
    } else {
      // Alternative: origin is bottom-left corner
      minY = originY;
      maxY = originY + (height * pixelHeight);
    }
    
    const resolution: [number, number] = [Math.abs(pixelWidth), Math.abs(pixelHeight)];
    
    return {
      width,
      height,
      bbox: [minX, minY, maxX, maxY],
      srs,
      origin: [originX, originY],
      pixelSize: [pixelWidth, pixelHeight],
      resolution
    };
  } catch (error: any) {
    throw Object.assign(
      new Error(`Failed to extract GeoTIFF metadata: ${error.message}`),
      { cause: error }
    );
  }
}

// ============================================================================
// Tile Rendering
// ============================================================================

export interface RenderTileOptions {
  sourceFile: string;
  sourceSRS: string;  // Source spatial reference system (e.g., 'EPSG:4326')
  targetSRS: string;
  bbox: [number, number, number, number];
  width: number;
  height: number;
  resamplingMethod?: 'nearest' | 'bilinear' | 'cubic' | 'lanczos';
}

/**
 * Render a map tile using GDAL warp and translate
 * @param options - Rendering options
 * @returns PNG buffer or null on failure
 */
export async function renderTile(options: RenderTileOptions): Promise<Buffer | null> {
  const {
    sourceFile,
    sourceSRS,
    targetSRS,
    bbox: [minX, minY, maxX, maxY],
    width,
    height,
    resamplingMethod = 'bilinear'
  } = options;
  
  // Create temporary files
  const tempOutputTif = path.join(os.tmpdir(), `wms_warp_${Date.now()}_${Math.random().toString(36).substring(7)}.tif`);
  const tempOutputPng = path.join(os.tmpdir(), `wms_${Date.now()}_${Math.random().toString(36).substring(7)}.png`);
  
  try {
    // Step 1: Use gdalwarp to reproject, clip, and resize
    // -s_srs: source spatial reference (CRITICAL for correct coordinate transformation)
    // -t_srs: target spatial reference
    // -te: target extent in target CRS coordinates
    // -ts: target size (width height)
    // -r: resampling method
    // -of: output format
    const gdalwarp = getGdalExecutable('gdalwarp.exe');
    const warpCmd = `${gdalwarp} -s_srs "${sourceSRS}" -t_srs "${targetSRS}" -te ${minX} ${minY} ${maxX} ${maxY} -ts ${width} ${height} -r ${resamplingMethod} -of GTiff "${sourceFile}" "${tempOutputTif}"`;
    
    await execAsync(warpCmd);
    
    // Step 2: Convert GeoTIFF to PNG using gdal_translate
    const gdal_translate = getGdalExecutable('gdal_translate.exe');
    const translateCmd = `${gdal_translate} -of PNG "${tempOutputTif}" "${tempOutputPng}"`;
    
    await execAsync(translateCmd);
    
    // Step 3: Read the PNG file
    const pngBuffer = fs.readFileSync(tempOutputPng);
    
    return pngBuffer;
  } catch (error) {
    console.error('[GDAL Renderer] Tile rendering failed:', error);
    return null;
  } finally {
    // Clean up temporary files
    try {
      if (fs.existsSync(tempOutputTif)) {
        fs.unlinkSync(tempOutputTif);
      }
      if (fs.existsSync(tempOutputPng)) {
        fs.unlinkSync(tempOutputPng);
      }
    } catch (cleanupError) {
      console.warn('[GDAL Renderer] Failed to cleanup temp files:', cleanupError);
    }
  }
}

/**
 * Check if two bounding boxes overlap
 * @param bbox1 - First bounding box [minX, minY, maxX, maxY]
 * @param bbox2 - Second bounding box [minX, minY, maxX, maxY]
 * @returns true if they overlap
 */
export function bboxesOverlap(
  bbox1: [number, number, number, number],
  bbox2: [number, number, number, number]
): boolean {
  const [minX1, minY1, maxX1, maxY1] = bbox1;
  const [minX2, minY2, maxX2, maxY2] = bbox2;
  
  return !(maxX1 < minX2 || minX1 > maxX2 || maxY1 < minY2 || minY1 > maxY2);
}

/**
 * Clip bbox1 to the intersection with bbox2
 * @param bbox1 - Bounding box to clip
 * @param bbox2 - Clipping bounding box
 * @returns Clipped bounding box
 */
export function clipBbox(
  bbox1: [number, number, number, number],
  bbox2: [number, number, number, number]
): [number, number, number, number] {
  const [minX1, minY1, maxX1, maxY1] = bbox1;
  const [minX2, minY2, maxX2, maxY2] = bbox2;
  
  return [
    Math.max(minX1, minX2),
    Math.max(minY1, minY2),
    Math.min(maxX1, maxX2),
    Math.min(maxY1, maxY2)
  ];
}
