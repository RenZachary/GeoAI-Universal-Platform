/**
 * WMS Publisher - Generates Web Map Service (WMS) endpoints for raster data
 * Supports GeoTIFF with dynamic map rendering and coordinate transformation
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import proj4 from 'proj4';
import { LRUCache } from 'lru-cache';
import type { DataSourceType, NativeData } from '../../core/index';
import type Database from 'better-sqlite3';

export interface WMSLayerOptions {
  name?: string;
  title?: string;
  abstract?: string;
  srs?: string;  // Spatial Reference System (e.g., 'EPSG:4326')
  bbox?: [number, number, number, number];  // [minX, minY, maxX, maxY]
  styles?: WMSStyle[];
}

export interface WMSStyle {
  name: string;
  title: string;
  legendUrl?: string;
  styleUrl?: string;  // SLD/SE style definition
}

export interface WMSGetMapParams {
  layers: string[];
  styles: string[];
  srs: string;
  bbox: [number, number, number, number];
  width: number;
  height: number;
  format: 'image/png' | 'image/jpeg' | 'image/geotiff';
  transparent?: boolean;
  bgcolor?: string;
}

export interface WMSServiceMetadata {
  id: string;
  serviceUrl: string;
  capabilities: string;
  layers: WMSLayerInfo[];
  supportedFormats: string[];
  supportedSRS: string[];
  generatedAt: string;
  dataSourceType: DataSourceType;
}

export interface WMSLayerInfo {
  name: string;
  title: string;
  abstract?: string;
  srs: string;
  bbox: [number, number, number, number];
  styles: WMSStyle[];
}

/**
 * Strategy interface for WMS map generation
 */
export interface WMSGenerationStrategy {
  /**
   * Generate WMS service from a data source
   * @param sourceReference - Data source reference
   * @param dataSourceType - Type of data source
   * @param options - WMS layer options
   * @returns serviceId - Unique identifier for the WMS service
   */
  generateService(
    sourceReference: string,
    dataSourceType: DataSourceType,
    options: WMSLayerOptions
  ): Promise<string>;
  
  /**
   * Get map image for GetMap request
   * @param serviceId - Service identifier
   * @param params - GetMap parameters
   * @returns Image buffer or null if failed
   */
  getMap?(serviceId: string, params: WMSGetMapParams): Promise<Buffer | null>;
  
  /**
   * Get WMS capabilities XML
   * @param serviceId - Service identifier
   * @returns Capabilities XML string
   */
  getCapabilities?(serviceId: string): Promise<string>;
}



/**
 * GeoTIFF WMS Strategy - Serves raster imagery via WMS
 * Uses geotiff.js for tile extraction and sharp for PNG rendering
 */
class GeoTIFFWMSStategy implements WMSGenerationStrategy {
  private serviceCache: Map<string, any> = new Map();
  private tileCache: LRUCache<string, Buffer>;
  
  constructor(private wmsOutputDir: string) {
    // Initialize LRU cache for rendered tiles (max 100 tiles, 1 hour TTL)
    this.tileCache = new LRUCache({
      max: 100,
      ttl: 1000 * 60 * 60 // 1 hour
    });
  }

  async generateService(
    sourceReference: string,
    dataSourceType: DataSourceType,
    options: WMSLayerOptions
  ): Promise<string> {
    console.log(`[GeoTIFF WMS Strategy] Creating WMS service from GeoTIFF`);
    
    if (!fs.existsSync(sourceReference)) {
      throw new Error(`GeoTIFF file not found: ${sourceReference}`);
    }
    
    // Read GeoTIFF metadata to extract bbox and CRS
    const { fromFile } = await import('geotiff');
    const tiff = await fromFile(sourceReference);
    const image = await tiff.getImage();
    
    // Extract georeferencing information
    const width = image.getWidth();
    const height = image.getHeight();
    const origin = image.getOrigin() || [0, 0];
    const resolution = image.getResolution() || [1, 1];
    
    // Calculate bbox from georeferencing
    const minX = origin[0];
    const maxY = origin[1];
    const maxX = origin[0] + (width * resolution[0]);
    const minY = origin[1] + (height * resolution[1]);
    
    // Get CRS from GeoKeys
    const geoKeys = image.getGeoKeys();
    const epsgCode = geoKeys?.GeographicTypeGeoKey || geoKeys?.ProjectedCSTypeGeoKey || 4326;
    const srs = `EPSG:${epsgCode}`;
    
    console.log(`[GeoTIFF WMS Strategy] Dimensions: ${width}x${height}`);
    console.log(`[GeoTIFF WMS Strategy] Origin: [${origin.join(', ')}]`);
    console.log(`[GeoTIFF WMS Strategy] Resolution: [${resolution.join(', ')}]`);
    console.log(`[GeoTIFF WMS Strategy] Bbox: [${minX}, ${minY}, ${maxX}, ${maxY}]`);
    console.log(`[GeoTIFF WMS Strategy] CRS: ${srs}`);
    
    // Generate service ID
    const serviceId = `wms_tiff_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const serviceDir = path.join(this.wmsOutputDir, serviceId);
    
    if (!fs.existsSync(serviceDir)) {
      fs.mkdirSync(serviceDir, { recursive: true });
    }
    
    // Cache service info with full metadata
    this.serviceCache.set(serviceId, {
      sourceReference,
      options,
      bbox: [minX, minY, maxX, maxY],
      srs,
      width,
      height,
      resolution,
      createdAt: Date.now()
    });
    
    // Create metadata
    const metadata: WMSServiceMetadata = {
      id: serviceId,
      serviceUrl: `/api/services/wms/${serviceId}`,
      capabilities: `/api/services/wms/${serviceId}?service=WMS&request=GetCapabilities`,
      layers: [{
        name: options.name || 'raster',
        title: options.title || 'GeoTIFF Layer',
        abstract: options.abstract || 'Raster layer from GeoTIFF',
        srs,
        bbox: [minX, minY, maxX, maxY],
        styles: options.styles || []
      }],
      supportedFormats: ['image/png', 'image/jpeg'],
      supportedSRS: [srs, 'EPSG:3857'],
      generatedAt: new Date().toISOString(),
      dataSourceType: 'tif'
    };
    
    const metadataPath = path.join(serviceDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    console.log(`[GeoTIFF WMS Strategy] WMS service created: ${serviceId}`);
    
    return serviceId;
  }
  
  async getMap(serviceId: string, params: WMSGetMapParams): Promise<Buffer | null> {
    const cached = this.serviceCache.get(serviceId);
    
    if (!cached) {
      console.warn(`[GeoTIFF WMS Strategy] Service not found: ${serviceId}`);
      return null;
    }
    
    try {
      // Generate cache key based on service, bbox, and output size
      const cacheKey = `${serviceId}:${params.bbox.join(',')}:${params.width}x${params.height}:${params.srs}`;
      
      // Check cache first
      if (this.tileCache.has(cacheKey)) {
        console.log('[GeoTIFF WMS Strategy] Cache hit - returning cached tile');
        return this.tileCache.get(cacheKey)!;
      }
      
      console.log(`[GeoTIFF WMS Strategy] Rendering raster map`);
      console.log(`[GeoTIFF WMS Strategy] Requested BBOX: ${params.bbox.join(',')}`);
      console.log(`[GeoTIFF WMS Strategy] Requested SRS: ${params.srs}`);
      console.log(`[GeoTIFF WMS Strategy] Output size: ${params.width}x${params.height}`);
      
      const { fromFile } = await import('geotiff');
      const { sourceReference, bbox: dataBbox, srs: nativeSRS, width: imgWidth, height: imgHeight } = cached;
      
      // Transform requested bbox to native CRS if different
      let transformedBbox = params.bbox;
      if (params.srs !== nativeSRS) {
        console.log(`[GeoTIFF WMS Strategy] Transforming bbox from ${params.srs} to ${nativeSRS}`);
        transformedBbox = this.transformBbox(params.bbox, params.srs, nativeSRS);
        console.log(`[GeoTIFF WMS Strategy] Transformed BBOX: ${transformedBbox.join(',')}`);
      }
      
      // Open GeoTIFF file
      const tiff = await fromFile(sourceReference);
      const image = await tiff.getImage();
      
      // Calculate pixel coordinates from requested bbox
      const [reqMinX, reqMinY, reqMaxX, reqMaxY] = transformedBbox;
      const [dataMinX, dataMinY, dataMaxX, dataMaxY] = dataBbox;
      
      // Check if requested bbox overlaps with data extent
      if (reqMaxX < dataMinX || reqMinX > dataMaxX || reqMaxY < dataMinY || reqMinY > dataMaxY) {
        console.warn('[GeoTIFF WMS Strategy] Requested bbox outside data extent');
        return this.createEmptyImage(params.width, params.height);
      }
      
      // Calculate pixel window to read
      const resolution = (dataMaxX - dataMinX) / imgWidth; // Assuming square pixels
      
      // Clamp to data bounds
      const clampedMinX = Math.max(reqMinX, dataMinX);
      const clampedMaxX = Math.min(reqMaxX, dataMaxX);
      const clampedMinY = Math.max(reqMinY, dataMinY);
      const clampedMaxY = Math.min(reqMaxY, dataMaxY);
      
      // Convert to pixel coordinates
      const xOff = Math.floor((clampedMinX - dataMinX) / resolution);
      const yOff = Math.floor((dataMaxY - clampedMaxY) / resolution); // Y axis inverted in images
      const xSize = Math.ceil((clampedMaxX - clampedMinX) / resolution);
      const ySize = Math.ceil((clampedMaxY - clampedMinY) / resolution);
      
      console.log(`[GeoTIFF WMS Strategy] Reading window: x=${xOff}, y=${yOff}, w=${xSize}, h=${ySize}`);
      
      // Read raster data for the requested area
      const rasters = await image.readRasters({
        window: [xOff, yOff, xSize, ySize],
        resampleMethod: 'bilinear',
        pool: undefined
      });
      
      // Get band count and convert to RGB
      const bandCount = rasters.length;
      console.log(`[GeoTIFF WMS Strategy] Band count: ${bandCount}`);
      
      // Normalize pixel values to 0-255 range
      let rgbData: Uint8ClampedArray;
      
      if (bandCount >= 3) {
        // RGB or RGBA - use first 3 bands
        const red = rasters[0];
        const green = rasters[1];
        const blue = rasters[2];
        
        // Find min/max for normalization
        const allValues = [...red, ...green, ...blue];
        const minVal = Math.min(...allValues);
        const maxVal = Math.max(...allValues);
        const range = maxVal - minVal || 1;
        
        // Create RGBA buffer
        const pixelCount = xSize * ySize;
        rgbData = new Uint8ClampedArray(pixelCount * 4);
        
        for (let i = 0; i < pixelCount; i++) {
          rgbData[i * 4] = ((red[i] - minVal) / range) * 255;     // R
          rgbData[i * 4 + 1] = ((green[i] - minVal) / range) * 255; // G
          rgbData[i * 4 + 2] = ((blue[i] - minVal) / range) * 255;  // B
          rgbData[i * 4 + 3] = 255;  // Alpha (fully opaque)
        }
      } else if (bandCount === 1) {
        // Single band - create grayscale
        const band = rasters[0];
        const minVal = Math.min(...band);
        const maxVal = Math.max(...band);
        const range = maxVal - minVal || 1;
        
        const pixelCount = xSize * ySize;
        rgbData = new Uint8ClampedArray(pixelCount * 4);
        
        for (let i = 0; i < pixelCount; i++) {
          const gray = ((band[i] - minVal) / range) * 255;
          rgbData[i * 4] = gray;     // R
          rgbData[i * 4 + 1] = gray; // G
          rgbData[i * 4 + 2] = gray; // B
          rgbData[i * 4 + 3] = 255;  // Alpha
        }
      } else {
        console.error('[GeoTIFF WMS Strategy] Unsupported band configuration');
        return this.createEmptyImage(params.width, params.height);
      }
      
      // Create PNG using canvas (Node.js built-in or sharp if available)
      const pngBuffer = await this.createPNGFromRGBA(rgbData, xSize, ySize, params.width, params.height);
      
      // Store in cache
      this.tileCache.set(cacheKey, pngBuffer);
      console.log(`[GeoTIFF WMS Strategy] Cached tile (cache size: ${this.tileCache.size})`);
      
      console.log(`[GeoTIFF WMS Strategy] Successfully rendered ${pngBuffer.length} bytes`);
      
      return pngBuffer;
      
    } catch (error) {
      console.error('[GeoTIFF WMS Strategy] Error rendering map:', error);
      return null;
    }
  }
  
  async getCapabilities(serviceId: string): Promise<string> {
    const cached = this.serviceCache.get(serviceId);
    
    if (!cached) {
      throw new Error(`WMS service not found: ${serviceId}`);
    }
    
    const { options, bbox, srs } = cached;
    
    // Generate full WMS 1.3.0 GetCapabilities XML
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
   * Transform bounding box from one CRS to another using proj4
   */
  private transformBbox(
    bbox: [number, number, number, number],
    fromSRS: string,
    toSRS: string
  ): [number, number, number, number] {
    try {
      const [minX, minY, maxX, maxY] = bbox;
      
      // Transform corners
      const [transformedMinX, transformedMinY] = proj4(fromSRS, toSRS, [minX, minY]);
      const [transformedMaxX, transformedMaxY] = proj4(fromSRS, toSRS, [maxX, maxY]);
      
      return [transformedMinX, transformedMinY, transformedMaxX, transformedMaxY];
    } catch (error) {
      console.error(`[GeoTIFF WMS Strategy] Coordinate transformation failed:`, error);
      // Return original bbox if transformation fails
      return bbox;
    }
  }
  
  /**
   * Create PNG from RGBA data using Canvas API
   */
  private async createPNGFromRGBA(
    rgbaData: Uint8ClampedArray,
    srcWidth: number,
    srcHeight: number,
    targetWidth: number,
    targetHeight: number
  ): Promise<Buffer> {
    try {
      // Try to use canvas package if available
      const { createCanvas } = await import('canvas');
      
      const canvas = createCanvas(targetWidth, targetHeight);
      const ctx = canvas.getContext('2d');
      
      // Create ImageData from source
      const imageData = ctx.createImageData(srcWidth, srcHeight);
      imageData.data.set(rgbaData);
      
      // Draw to canvas (with scaling if needed)
      const tempCanvas = createCanvas(srcWidth, srcHeight);
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(imageData, 0, 0);
      
      // Scale to target size
      ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
      
      // Convert to PNG buffer
      return canvas.toBuffer('image/png');
      
    } catch (error) {
      console.warn('[GeoTIFF WMS Strategy] Canvas not available, using fallback');
      
      // Fallback: Return minimal PNG if canvas is not installed
      return this.createEmptyImage(targetWidth, targetHeight);
    }
  }
  
  /**
   * Create empty transparent PNG as fallback
   */
  private createEmptyImage(width: number, height: number): Buffer {
    // Minimal valid PNG (transparent)
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    ]);
    
    // IHDR chunk
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type (RGBA)
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace
    
    // Calculate CRC for IHDR
    const ihdrCrc = this.calculateCRC(Buffer.concat([Buffer.from('IHDR'), ihdr]));
    
    // IDAT chunk (compressed empty image data)
    const rawData = Buffer.alloc((width * height * 4) + height); // RGBA + filter byte per row
    for (let y = 0; y < height; y++) {
      rawData[y * (width * 4 + 1)] = 0; // Filter: None
    }
    const compressed = zlib.deflateSync(rawData);
    
    const idatCrc = this.calculateCRC(Buffer.concat([Buffer.from('IDAT'), compressed]));
    
    // IEND chunk
    const iendCrc = this.calculateCRC(Buffer.from('IEND'));
    
    return Buffer.concat([
      pngHeader,
      Buffer.from([0x00, 0x00, 0x00, 0x0D]), // IHDR length
      Buffer.from('IHDR'),
      ihdr,
      ihdrCrc,
      Buffer.from([compressed.length >> 24, (compressed.length >> 16) & 0xFF, (compressed.length >> 8) & 0xFF, compressed.length & 0xFF]),
      Buffer.from('IDAT'),
      compressed,
      idatCrc,
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // IEND length
      Buffer.from('IEND'),
      iendCrc
    ]);
  }
  
  /**
   * Calculate CRC32 checksum
   */
  private calculateCRC(data: Buffer): Buffer {
    // Simple CRC32 implementation without external dependency
    let crc = 0xFFFFFFFF;
    const table = this.getCRC32Table();
    
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    const crcValue = (crc ^ 0xFFFFFFFF) >>> 0;
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crcValue, 0);
    return crcBuffer;
  }
  
  /**
   * Generate CRC32 lookup table
   */
  private getCRC32Table(): Uint32Array {
    const table = new Uint32Array(256);
    
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    
    return table;
  }
}

export class WMSPublisher {
  private workspaceBase: string;
  private wmsOutputDir: string;
  private db?: Database.Database;
  private strategies: Map<DataSourceType, WMSGenerationStrategy>;

  constructor(workspaceBase: string, db?: Database.Database) {
    this.workspaceBase = workspaceBase;
    this.wmsOutputDir = path.join(workspaceBase, 'results', 'wms');
    this.db = db;
    
    // Ensure output directory exists
    if (!fs.existsSync(this.wmsOutputDir)) {
      fs.mkdirSync(this.wmsOutputDir, { recursive: true });
    }
    
    // Register default strategies - WMS only supports raster (GeoTIFF)
    this.strategies = new Map();
    this.registerStrategy('tif', new GeoTIFFWMSStategy(this.wmsOutputDir));
    
    console.log('[WMS Publisher] Initialized');
  }
  
  /**
   * Register a custom WMS generation strategy
   */
  registerStrategy(type: DataSourceType, strategy: WMSGenerationStrategy): void {
    this.strategies.set(type, strategy);
    console.log(`[WMS Publisher] Registered strategy for: ${type}`);
  }
  
  /**
   * Get strategy for a data source type
   */
  private getStrategy(type: DataSourceType): WMSGenerationStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(`No WMS generation strategy registered for data type: ${type}`);
    }
    return strategy;
  }

  /**
   * Generate WMS service from NativeData reference
   */
  async generateService(
    nativeData: NativeData,
    options: WMSLayerOptions = {}
  ): Promise<string> {
    console.log('[WMS Publisher] Generating WMS service from NativeData...');
    console.log(`[WMS Publisher] Data source type: ${nativeData.type}`);
    
    // Get the appropriate strategy
    const strategy = this.getStrategy(nativeData.type);
    
    // Delegate to the strategy
    return strategy.generateService(
      nativeData.reference,
      nativeData.type,
      options
    );
  }

  /**
   * Get map image for GetMap request
   */
  async getMap(serviceId: string, params: WMSGetMapParams): Promise<Buffer | null> {
    // Find which service this belongs to by checking metadata
    const metadata = this.getServiceMetadata(serviceId);
    
    if (!metadata) {
      console.warn(`[WMS Publisher] Service not found: ${serviceId}`);
      return null;
    }
    
    // Get the strategy for this service's data type
    const strategy = this.getStrategy(metadata.dataSourceType);
    
    if (strategy.getMap) {
      return strategy.getMap(serviceId, params);
    }
    
    return null;
  }

  /**
   * Get WMS capabilities XML
   */
  async getCapabilities(serviceId: string): Promise<string | null> {
    const metadata = this.getServiceMetadata(serviceId);
    
    if (!metadata) {
      return null;
    }
    
    const strategy = this.getStrategy(metadata.dataSourceType);
    
    if (strategy.getCapabilities) {
      return strategy.getCapabilities(serviceId);
    }
    
    return null;
  }

  /**
   * Get service metadata
   */
  getServiceMetadata(serviceId: string): WMSServiceMetadata | null {
    const metadataPath = path.join(this.wmsOutputDir, serviceId, 'metadata.json');
    
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      return metadata;
    }
    
    return null;
  }

  /**
   * List all available WMS services
   */
  listServices(): Array<{ id: string; metadata: WMSServiceMetadata }> {
    if (!fs.existsSync(this.wmsOutputDir)) {
      return [];
    }

    const services: Array<{ id: string; metadata: WMSServiceMetadata }> = [];
    const entries = fs.readdirSync(this.wmsOutputDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(this.wmsOutputDir, entry.name, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          services.push({ id: entry.name, metadata });
        }
      }
    }

    return services;
  }

  /**
   * Delete a WMS service
   */
  deleteService(serviceId: string): boolean {
    const serviceDir = path.join(this.wmsOutputDir, serviceId);
    
    if (fs.existsSync(serviceDir)) {
      fs.rmSync(serviceDir, { recursive: true, force: true });
      console.log(`[WMS Publisher] Deleted service: ${serviceId}`);
      return true;
    }
    
    return false;
  }
}
