/**
 * GeoTIFF WMS Strategy - Serves raster imagery via WMS using GDAL
 * 
 * Uses gdalinfo for metadata extraction and gdalwarp/gdal_translate for tile rendering
 */

import fs from 'fs';
import path from 'path';
import { LRUCache } from 'lru-cache';
import type { DataSourceType } from '../../../core/index';
import type {
  WMSLayerOptions,
  WMSGetMapParams,
  WMSServiceMetadata
} from './WMSPublisherTypes';
import type { WMSGenerationStrategy } from './BaseWMSPublisher';
import {
  extractGeoTIFFMetadata,
  renderTile,
  bboxesOverlap,
  clipBbox,
  transformBbox
} from './GDALTileRenderer';

interface ServiceCacheEntry {
  sourceReference: string;
  options: WMSLayerOptions;
  bbox: [number, number, number, number];  // Bbox in EPSG:3857 (Web Mercator)
  srs: string;  // Always 'EPSG:3857' for cached entries
  sourceSRS: string;  // Original source file CRS (e.g., 'EPSG:4326')
  width: number;
  height: number;
  resolution: [number, number];
  createdAt: number;
}

/**
 * GeoTIFF WMS Strategy implementation
 */
export class GeoTIFFWMSStategy implements WMSGenerationStrategy {
  private serviceCache: Map<string, ServiceCacheEntry> = new Map();
  private tileCache: LRUCache<string, Buffer>;
  
  constructor(private wmsOutputDir: string) {
    // Initialize LRU cache for rendered tiles (max 100 tiles, 1 hour TTL)
    this.tileCache = new LRUCache({
      max: 100,
      ttl: 1000 * 60 * 60 // 1 hour
    });
  }

  /**
   * Restore a service from metadata (used for server restart recovery)
   */
  async restoreServiceFromMetadata(serviceId: string, cacheData: ServiceCacheEntry): Promise<void> {
    // Transform bbox to EPSG:3857 if needed
    if (cacheData.srs !== 'EPSG:3857' && cacheData.sourceSRS) {
      try {
        const bbox3857 = await transformBbox(cacheData.bbox, cacheData.sourceSRS, 'EPSG:3857');
        cacheData.bbox = bbox3857;
        cacheData.srs = 'EPSG:3857';
      } catch (error: any) {
        console.error('[GeoTIFF WMS Strategy] Failed to transform bbox during restore:', error.message);
      }
    }
    
    this.serviceCache.set(serviceId, cacheData);
  }

  async generateService(
    sourceReference: string,
    dataSourceType: DataSourceType,
    options: WMSLayerOptions
  ): Promise<string> {
    if (!fs.existsSync(sourceReference)) {
      throw new Error(`GeoTIFF file not found: ${sourceReference}`);
    }
    
    // Extract metadata using GDAL
    const metadata = await extractGeoTIFFMetadata(sourceReference);
    
    // Transform bbox to EPSG:3857 (Web Mercator) for consistent tile rendering
    let bbox3857: [number, number, number, number];
    try {
      bbox3857 = await transformBbox(metadata.bbox, metadata.srs, 'EPSG:3857');
    } catch (error: any) {
      console.error('[GeoTIFF WMS Strategy] Failed to transform bbox, using original:', error.message);
      bbox3857 = metadata.bbox; // Fallback to original
    }
    
    // Generate service ID
    const serviceId = `wms_tiff_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Cache service info with EPSG:3857 bbox
    this.serviceCache.set(serviceId, {
      sourceReference,
      options,
      bbox: bbox3857,  // Store in EPSG:3857
      srs: 'EPSG:3857',  // Cache uses EPSG:3857
      sourceSRS: metadata.srs,  // Original source CRS
      width: metadata.width,
      height: metadata.height,
      resolution: metadata.resolution,
      createdAt: Date.now()
    });
    
    // Create and save metadata
    const serviceMetadata: WMSServiceMetadata = {
      id: serviceId,
      serviceUrl: `/api/services/wms/${serviceId}`,
      capabilities: `/api/services/wms/${serviceId}?service=WMS&request=GetCapabilities`,
      layers: [{
        name: options.name || 'raster',
        title: options.title || 'GeoTIFF Layer',
        abstract: options.abstract || 'Raster layer from GeoTIFF',
        srs: metadata.srs,
        bbox: metadata.bbox,
        styles: options.styles || [],
        width: metadata.width,
        height: metadata.height
      }],
      supportedFormats: ['image/png', 'image/jpeg'],
      supportedSRS: [metadata.srs, 'EPSG:3857'],
      generatedAt: new Date().toISOString(),
      dataSourceType: 'tif'
    };
    
    const metadataPath = path.join(this.wmsOutputDir, serviceId, 'metadata.json');
    if (!fs.existsSync(path.dirname(metadataPath))) {
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
    }
    fs.writeFileSync(metadataPath, JSON.stringify(serviceMetadata, null, 2));
    
    return serviceId;
  }
  
  async getMap(serviceId: string, params: WMSGetMapParams): Promise<Buffer | null> {
    const cached = this.serviceCache.get(serviceId);
    
    if (!cached) {
      return null;
    }
    
    try {
      // Generate cache key
      const cacheKey = `${serviceId}:${params.bbox.join(',')}:${params.width}x${params.height}:${params.srs}`;
      
      // Check cache first
      if (this.tileCache.has(cacheKey)) {
        return this.tileCache.get(cacheKey)!;
      }
      
      const [minX, minY, maxX, maxY] = params.bbox;
      
      // Validate that requested bbox overlaps with source data extent
      const overlaps = bboxesOverlap(params.bbox, cached.bbox);
      
      if (!overlaps) {
        // Return transparent image for non-overlapping requests
        return this.createEmptyImage(params.width, params.height);
      }
      
      // Clip bbox to source extent (both in EPSG:3857 now)
      const clippedBbox = clipBbox(params.bbox, cached.bbox);
      
      // Render tile using GDAL - use ORIGINAL params.bbox for correct scaling
      const pngBuffer = await renderTile({
        sourceFile: cached.sourceReference,
        sourceSRS: cached.sourceSRS,  // Original source CRS (e.g., EPSG:4326)
        targetSRS: params.srs,  // Target CRS (EPSG:3857)
        bbox: params.bbox,  // Use original requested bbox (not clipped) for correct scaling
        width: params.width,
        height: params.height,
        resamplingMethod: 'bilinear'
      });
      
      if (!pngBuffer) {
        return this.createEmptyImage(params.width, params.height);
      }
      
      // Store in cache
      this.tileCache.set(cacheKey, pngBuffer);
      
      return pngBuffer;
    } catch (error) {
      console.error('[GeoTIFF WMS Strategy] Error rendering map:', error);
      return this.createEmptyImage(params.width, params.height);
    }
  }
  
  async getCapabilities(serviceId: string): Promise<string> {
    const cached = this.serviceCache.get(serviceId);
    
    if (!cached) {
      throw new Error(`WMS service not found: ${serviceId}`);
    }
    
    const { options, bbox, srs } = cached;
    
    // Generate WMS 1.3.0 GetCapabilities XML
    return `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Service>
    <Name>WMS</Name>
    <Title>GeoAI-UP GeoTIFF WMS Service</Title>
    <Abstract>Web Map Service for GeoTIFF raster data</Abstract>
  </Service>
  <Capability>
    <Request>
      <GetCapabilities>
        <Format>application/xml</Format>
        <DCPType>
          <HTTP>
            <Get>
              <OnlineResource xmlns:xlink="http://www.w3.org/1999/xlink" 
                xlink:href="/api/services/wms/${serviceId}?"/>
            </Get>
          </HTTP>
        </DCPType>
      </GetCapabilities>
      <GetMap>
        <Format>image/png</Format>
        <Format>image/jpeg</Format>
        <DCPType>
          <HTTP>
            <Get>
              <OnlineResource xmlns:xlink="http://www.w3.org/1999/xlink" 
                xlink:href="/api/services/wms/${serviceId}?"/>
            </Get>
          </HTTP>
        </DCPType>
      </GetMap>
    </Request>
    <Layer>
      <Title>${options.title || 'GeoTIFF Layer'}</Title>
      <CRS>${srs}</CRS>
      <EX_GeographicBoundingBox>
        <westBoundLongitude>${bbox[0]}</westBoundLongitude>
        <eastBoundLongitude>${bbox[2]}</eastBoundLongitude>
        <southBoundLatitude>${bbox[1]}</southBoundLatitude>
        <northBoundLatitude>${bbox[3]}</northBoundLatitude>
      </EX_GeographicBoundingBox>
      <Layer queryable="0">
        <Name>${options.name || 'raster'}</Name>
        <Title>${options.title || 'GeoTIFF Layer'}</Title>
        <CRS>${srs}</CRS>
        <BoundingBox CRS="${srs}" 
          minx="${bbox[0]}" miny="${bbox[1]}" 
          maxx="${bbox[2]}" maxy="${bbox[3]}"/>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;
  }
  
  /**
   * Create empty transparent PNG as fallback
   */
  private createEmptyImage(width: number, height: number): Buffer {
    // Minimal valid PNG (transparent 1x1 pixel)
    const minimalPNG = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, // IHDR length
      0x49, 0x48, 0x44, 0x52, // "IHDR"
      0x00, 0x00, 0x00, 0x01, // Width: 1
      0x00, 0x00, 0x00, 0x01, // Height: 1
      0x08, 0x06, 0x00, 0x00, 0x00, // Bit depth, color type, etc.
      0x1F, 0x15, 0xC4, 0x89, // CRC
      0x00, 0x00, 0x00, 0x0A, // IDAT length
      0x49, 0x44, 0x41, 0x54, // "IDAT"
      0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, // Compressed data
      0x0D, 0x0A, 0x2D, 0xB4, // CRC
      0x00, 0x00, 0x00, 0x00, // IEND length
      0x49, 0x45, 0x4E, 0x44, // "IEND"
      0xAE, 0x42, 0x60, 0x82  // CRC
    ]);
    
    return minimalPNG;
  }
}
