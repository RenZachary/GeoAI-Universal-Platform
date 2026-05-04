/**
 * GDAL-based TIFF WMS Publisher
 * 
 * Uses gdal-async to read GeoTIFF metadata and system gdalwarp command for rendering.
 * This provides proper coordinate transformation and image rendering.
 */

import { IWMSPublisher, WMSMapCallback, WMSPublisherOptions, WMSRequest } from './IWMSPublisher';

// Set PROJ_LIB before importing gdal-async to avoid version conflicts with PostgreSQL/PostGIS
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projLibPath = path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'gdal-async', 'deps', 'libproj', 'proj', 'data');
process.env.PROJ_LIB = projLibPath;

import gdal from 'gdal-async';
import * as fs from 'fs/promises';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TIFFCacheEntry {
  dataset: any; // GDAL Dataset
  bbox: [number, number, number, number];
  width: number;
  height: number;
  srs: any; // GDAL SpatialReference
  crsCode?: number;
  timestamp: number;
}

export class GDALTIFFWMSPublisher implements IWMSPublisher {
  private cache = new Map<string, TIFFCacheEntry>();
  private options: Required<WMSPublisherOptions>;

  constructor(defaultOptions?: WMSPublisherOptions) {
    this.options = {
      format: 'image/png',
      quality: 80,
      enableCache: true,
      cacheTTL: 3600,
      ...defaultOptions
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { cachedDatasources: number; totalImagesGenerated?: number } {
    return {
      cachedDatasources: this.cache.size
    };
  }

  /**
   * Create a WMS service callback for a TIFF datasource using GDAL
   */
  async createWMSService(
    datasourceId: string,
    dataProvider: () => Promise<any>,
    options?: WMSPublisherOptions
  ): Promise<WMSMapCallback> {
    const mergedOptions = { ...this.options, ...options };
    
    // Pre-load the TIFF file
    const config = await dataProvider();
    const tiffPath = config.path || config.config?.path;
    
    if (!tiffPath) {
      throw new Error('TIFF path not provided in dataProvider');
    }

    // Load and cache the TIFF metadata
    await this.loadTIFF(datasourceId, tiffPath);

    return async (request: WMSRequest): Promise<Buffer | null> => {
      try {
        const cacheKey = `${request.layerId}_${request.bbox.join(',')}_${request.width}x${request.height}`;
        
        // Render the image using GDAL
        const imageBuffer = await this.renderWMSImage(request, tiffPath, mergedOptions);
        
        return imageBuffer;
      } catch (error) {
        console.error(`❌ WMS rendering failed for ${request.layerId}:`, error);
        return null;
      }
    };
  }

  /**
   * Load and cache TIFF file metadata using GDAL
   */
  private async loadTIFF(datasourceId: string, tiffPath: string): Promise<void> {
    if (this.cache.has(datasourceId)) {
      return;
    }

    try {
      const dataset = gdal.open(tiffPath);
      
      const width = dataset.rasterSize.x;
      const height = dataset.rasterSize.y;
      
      // Get georeferencing info
      const geoTransform = dataset.geoTransform;
      if (!geoTransform) {
        throw new Error('TIFF file has no georeferencing information');
      }
      
      const [originX, pixelWidth, rotationX, originY, rotationY, pixelHeight] = geoTransform;
      
      // Calculate bounding box
      const minX = originX;
      const maxX = originX + (width * pixelWidth);
      const maxY = originY;
      const minY = originY + (height * pixelHeight);
      
      // Get spatial reference
      const srs = dataset.srs;
      const crsCode = srs ? this.extractCRSCode(srs) : undefined;
      
      console.log(`✅ Loaded TIFF with GDAL: ${datasourceId} (${width}x${height}), CRS code: ${crsCode || 'unknown'}`);
      console.log(`   BBOX: [${minX.toFixed(6)}, ${minY.toFixed(6)}, ${maxX.toFixed(6)}, ${maxY.toFixed(6)}]`);
      console.log(`   GeoTransform: [${geoTransform.map((v: number) => v.toFixed(6)).join(', ')}]`);

      this.cache.set(datasourceId, {
        dataset,
        bbox: [minX, minY, maxX, maxY],
        width,
        height,
        srs,
        crsCode,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error(`❌ Failed to load TIFF with GDAL: ${tiffPath}`, error);
      throw error;
    }
  }

  /**
   * Extract CRS code from GDAL SpatialReference
   */
  private extractCRSCode(srs: any): number | undefined {
    try {
      // Try to get EPSG code
      const authCode = srs.getAuthorityCode(null);
      if (authCode) {
        return parseInt(authCode);
      }
      
      // Fallback: try to parse from WKT
      const wkt = srs.toWKT();
      const epsgMatch = wkt.match(/EPSG["']?[:"]?(\d+)/i);
      if (epsgMatch) {
        return parseInt(epsgMatch[1]);
      }
    } catch (error) {
      console.warn('Could not extract CRS code from GDAL SRS');
    }
    return undefined;
  }

  /**
   * Render a WMS image for the requested bbox and dimensions using GDAL warp
   */
  private async renderWMSImage(
    request: WMSRequest,
    tiffPath: string,
    options: Required<WMSPublisherOptions>
  ): Promise<Buffer | null> {
    const cacheEntry = this.cache.get(request.layerId);
    if (!cacheEntry) {
      await this.loadTIFF(request.layerId, tiffPath);
    }

    const entry = this.cache.get(request.layerId);
    if (!entry) {
      throw new Error('Failed to load TIFF');
    }

    const { dataset, bbox: tiffBbox, srs, crsCode } = entry;
    const [minX, minY, maxX, maxY] = request.bbox;

    try {
      // Set up the destination spatial reference
      let dstSRS;
      if (request.crs === 'EPSG:3857') {
        dstSRS = 'EPSG:3857';
      } else if (request.crs === 'EPSG:4326') {
        dstSRS = 'EPSG:4326';
      } else {
        dstSRS = 'EPSG:4326'; // Default
      }

      // Create temporary files
      const tempOutputTif = path.join(os.tmpdir(), `wms_warp_${Date.now()}.tif`);
      const tempOutputPng = path.join(os.tmpdir(), `wms_${Date.now()}.png`);

      // Build and execute gdalwarp command for reprojection and resampling
      const cmd = `gdalwarp -t_srs ${dstSRS} -te ${minX} ${minY} ${maxX} ${maxY} -ts ${request.width} ${request.height} -r bilinear -of GTiff "${tiffPath}" "${tempOutputTif}"`;
      await execAsync(cmd);
      
      // Convert GeoTIFF to PNG using gdal_translate
      const convertCmd = `gdal_translate -of PNG "${tempOutputTif}" "${tempOutputPng}"`;
      await execAsync(convertCmd);
      
      // Read the PNG file
      const buffer = await fs.readFile(tempOutputPng);
      
      // Clean up temp files
      await fs.unlink(tempOutputTif).catch(() => {});
      await fs.unlink(tempOutputPng).catch(() => {});

      console.log(`✅ Rendered WMS tile: ${request.width}x${request.height}`);
      return buffer;

    } catch (error: any) {
      console.error(`❌ GDAL command failed:`, error.message);
      return this.createTransparentImage(request.width, request.height);
    }
  }

  /**
   * Create a transparent PNG image
   */
  private async createTransparentImage(width: number, height: number): Promise<Buffer> {
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(width, height);
    return canvas.toBuffer('image/png');
  }

  /**
   * Clear cached data
   */
  clearCache(datasourceId?: string): void {
    if (datasourceId) {
      const entry = this.cache.get(datasourceId);
      if (entry && entry.dataset) {
        entry.dataset.close();
      }
      this.cache.delete(datasourceId);
    } else {
      this.cache.forEach((entry) => {
        if (entry.dataset) {
          entry.dataset.close();
        }
      });
      this.cache.clear();
    }
  }
}
