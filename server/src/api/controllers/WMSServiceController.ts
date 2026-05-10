/**
 * WMS Service Controller - Handles WMS protocol requests
 * Implements OGC WMS 1.3.0 standard operations
 */

import type { Request, Response } from 'express';
import { WMSPublisher, type WMSGetMapParams } from '../../publishers/WMSPublisher';
import type Database from 'better-sqlite3';

export class WMSServiceController {
  private wmsPublisher: WMSPublisher;

  constructor(workspaceBase: string, db?: Database.Database) {
    this.wmsPublisher = WMSPublisher.getInstance(workspaceBase, db);
  }

  /**
   * GET /api/services/wms/:serviceId - WMS endpoint
   * Handles GetCapabilities, GetMap, and other WMS operations
   */
  async handleWMSRequest(req: Request, res: Response): Promise<void> {
    try {
      const { serviceId } = req.params;
      const { request } = req.query;

      const sid = Array.isArray(serviceId) ? serviceId[0] : serviceId;

      if (!sid) {
        res.status(400).json({
          success: false,
          error: 'Service ID is required'
        });
        return;
      }

      // Route to appropriate WMS operation
      const reqType = (request as string)?.toLowerCase();

      switch (reqType) {
        case 'getcapabilities':
          await this.handleGetCapabilities(sid, res);
          break;

        case 'getmap':
          await this.handleGetMap(sid, req, res);
          break;

        case 'getfeatureinfo':
          await this.handleGetFeatureInfo(sid, req, res);
          break;

        default:
          // If no request parameter, return capabilities by default
          if (!request) {
            await this.handleGetCapabilities(sid, res);
          } else {
            res.status(400).json({
              success: false,
              error: `Unsupported WMS request: ${request}`,
              supportedOperations: ['GetCapabilities', 'GetMap', 'GetFeatureInfo']
            });
          }
      }

    } catch (error) {
      console.error('[WMS Service] Error handling request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process WMS request',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle GetCapabilities request
   * Returns XML describing the WMS service capabilities
   */
  private async handleGetCapabilities(serviceId: string, res: Response): Promise<void> {
    try {
      const capabilities = await this.wmsPublisher.getCapabilities(serviceId);

      if (!capabilities) {
        res.status(404).json({
          success: false,
          error: 'WMS service not found',
          serviceId
        });
        return;
      }

      // Set XML headers
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      res.send(capabilities);

    } catch (error) {
      console.error('[WMS Service] Error getting capabilities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get capabilities',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle GetMap request
   * Returns map image based on parameters
   */
  private async handleGetMap(serviceId: string, req: Request, res: Response): Promise<void> {
    try {
      const {
        layers,
        styles,
        crs,
        srs,
        bbox,
        width,
        height,
        format,
        transparent,
        bgcolor
      } = req.query;

      // Parse required parameters
      if (!layers || !bbox || !width || !height) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: layers, bbox, width, height'
        });
        return;
      }

      // Parse BBOX
      const bboxStr = Array.isArray(bbox) ? String(bbox[0]) : String(bbox);
      const bboxParts = bboxStr.split(',').map(Number);

      if (bboxParts.length !== 4 || bboxParts.some(isNaN)) {
        res.status(400).json({
          success: false,
          error: 'Invalid bbox format. Expected: minX,minY,maxX,maxY'
        });
        return;
      }

      // Parse dimensions
      const widthNum = parseInt(Array.isArray(width) ? String(width[0]) : String(width));
      const heightNum = parseInt(Array.isArray(height) ? String(height[0]) : String(height));

      if (isNaN(widthNum) || isNaN(heightNum) || widthNum <= 0 || heightNum <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid width or height'
        });
        return;
      }

      // Build GetMap parameters
      const params: WMSGetMapParams = {
        layers: Array.isArray(layers) ? layers.map(String) : [String(layers)],
        styles: styles ? (Array.isArray(styles) ? styles.map(String) : [String(styles)]) : [''],
        srs: (Array.isArray(crs) ? String(crs[0]) : String(crs || 'EPSG:4326')) || 
             (Array.isArray(srs) ? String(srs[0]) : String(srs || 'EPSG:4326')) || 
             'EPSG:4326',
        bbox: bboxParts as [number, number, number, number],
        width: widthNum,
        height: heightNum,
        format: (format as any) || 'image/png',
        transparent: transparent === 'true',
        bgcolor: Array.isArray(bgcolor) ? String(bgcolor[0]) : String(bgcolor || '')
      };

      // Validate format
      if (!['image/png', 'image/jpeg', 'image/geotiff'].includes(params.format)) {
        res.status(400).json({
          success: false,
          error: `Unsupported format: ${params.format}`
        });
        return;
      }

      // Get map image
      const imageBuffer = await this.wmsPublisher.getMap(serviceId, params);

      if (!imageBuffer || imageBuffer.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Failed to generate map image',
          serviceId,
          params
        });
        return;
      }

      // Set appropriate headers based on format
      res.setHeader('Content-Type', params.format);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

      res.send(imageBuffer);

    } catch (error) {
      console.error('[WMS Service] Error generating map:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate map',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle GetFeatureInfo request
   * Returns feature information at a specific pixel location
   */
  private async handleGetFeatureInfo(serviceId: string, req: Request, res: Response): Promise<void> {
    try {
      const { i, j, query_layers } = req.query;

      if (!i || !j || !query_layers) {
        res.status(400).json({
          success: false,
          error: 'Missing required parameters: i, j, query_layers'
        });
        return;
      }

      // GetFeatureInfo requires spatial query at clicked coordinates
      // Implementation would need to:
      // 1. Convert pixel coordinates (i, j) to map coordinates
      // 2. Query underlying data source for features at that location
      // 3. Return feature attributes as JSON/XML
      // This is an advanced WMS feature - implement if needed

      res.status(501).json({
        success: false,
        error: 'GetFeatureInfo not yet implemented',
        note: 'This feature requires spatial query support in the underlying data source'
      });

    } catch (error) {
      console.error('[WMS Service] Error getting feature info:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get feature info',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/services/wms - List all available WMS services
   */
  async listServices(req: Request, res: Response): Promise<void> {
    try {
      const services = this.wmsPublisher.listServices();

      res.json({
        success: true,
        count: services.length,
        services: services.map(s => ({
          id: s.id,
          serviceUrl: s.metadata.serviceUrl,
          layers: s.metadata.layers,
          generatedAt: s.metadata.generatedAt,
          dataSourceType: s.metadata.dataSourceType
        }))
      });

    } catch (error) {
      console.error('[WMS Service] Error listing services:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list services',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/services/wms/:serviceId/metadata - Get service metadata
   */
  async getServiceMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { serviceId } = req.params;
      const sid = Array.isArray(serviceId) ? serviceId[0] : serviceId;

      const metadata = this.wmsPublisher.getServiceMetadata(sid);

      if (!metadata) {
        res.status(404).json({
          success: false,
          error: 'WMS service not found',
          serviceId: sid
        });
        return;
      }

      res.json({
        success: true,
        data: metadata
      });

    } catch (error) {
      console.error('[WMS Service] Error getting metadata:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get metadata',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/services/wms/:serviceId - Delete a WMS service
   */
  async deleteService(req: Request, res: Response): Promise<void> {
    try {
      const { serviceId } = req.params;
      const sid = Array.isArray(serviceId) ? serviceId[0] : serviceId;

      const deleted = this.wmsPublisher.deleteService(sid);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'WMS service not found',
          serviceId: sid
        });
        return;
      }

      res.json({
        success: true,
        message: 'WMS service deleted successfully',
        serviceId: sid
      });

    } catch (error) {
      console.error('[WMS Service] Error deleting service:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete service',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/services/wms/:serviceId/tile/:z/:x/:y.png - WMS tile endpoint
   * Converts XYZ tile coordinates to WMS GetMap request
   * This is a convenience endpoint for MapLibre GL JS raster sources
   */
  async handleTileRequest(req: Request, res: Response): Promise<void> {
    try {
      const { serviceId, z, x, y } = req.params;
      
      const sid = Array.isArray(serviceId) ? serviceId[0] : serviceId;
      const zNum = parseInt(Array.isArray(z) ? String(z[0]) : String(z));
      const xNum = parseInt(Array.isArray(x) ? String(x[0]) : String(x));
      const yNum = parseInt(Array.isArray(y) ? String(y[0]) : String(y));

      if (!sid || isNaN(zNum) || isNaN(xNum) || isNaN(yNum)) {
        res.status(400).json({
          success: false,
          error: 'Invalid parameters: serviceId, z, x, y are required'
        });
        return;
      }

      // Convert XYZ tile coordinates to Web Mercator (EPSG:3857) bbox
      const mercatorBbox = this.xyzToMercatorBbox(xNum, yNum, zNum);
      
      // Call GetMap with Mercator coordinates
      const imageBuffer = await this.wmsPublisher.getMap(sid, {
        layers: ['raster'],
        styles: [''],
        srs: 'EPSG:3857',  // Use Web Mercator for proper tile alignment
        bbox: mercatorBbox,
        width: 256,
        height: 256,
        format: 'image/png',
        transparent: true
      });

      if (!imageBuffer) {
        res.status(404).json({
          success: false,
          error: 'Failed to generate tile'
        });
        return;
      }

      // Set cache headers for tiles
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      res.send(imageBuffer);

    } catch (error) {
      console.error('[WMS Service] Error generating tile:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate tile',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Convert XYZ tile coordinates to Web Mercator (EPSG:3857) bounding box
   * This is the standard approach for web map tiles
   * @param x - Tile X coordinate
   * @param y - Tile Y coordinate  
   * @param z - Zoom level
   * @returns [minX, minY, maxX, maxY] in EPSG:3857 (meters)
   */
  private xyzToMercatorBbox(x: number, y: number, z: number): [number, number, number, number] {
    const n = Math.pow(2, z);
    const tileSize = 20037508.34; // Half of Earth's circumference in meters (Web Mercator)
    
    // Calculate Mercator coordinates
    const minX = (x / n) * 2 * tileSize - tileSize;
    const maxX = ((x + 1) / n) * 2 * tileSize - tileSize;
    
    // Y axis is inverted in tile coordinates (0 at top)
    const maxY = tileSize - (y / n) * 2 * tileSize;
    const minY = tileSize - ((y + 1) / n) * 2 * tileSize;
    
    return [minX, minY, maxX, maxY];
  }

  /**
   * Convert XYZ tile coordinates to WGS84 bounding box
   * Uses standard Web Mercator (EPSG:3857) to WGS84 (EPSG:4326) conversion
   * @param x - Tile X coordinate
   * @param y - Tile Y coordinate  
   * @param z - Zoom level
   * @returns [minX, minY, maxX, maxY] in EPSG:4326
   */
  private xyzToBbox(x: number, y: number, z: number): [number, number, number, number] {
    const n = Math.pow(2, z);
    
    // Calculate longitude (simple linear mapping)
    const minX = (x / n) * 360.0 - 180.0;
    const maxX = ((x + 1) / n) * 360.0 - 180.0;
    
    // Calculate latitude using inverse Mercator projection
    // Standard formula: lat = arctan(sinh(π * (1 - 2*y/n)))
    const yMin = y / n;
    const yMax = (y + 1) / n;
    
    const minY = this.mercatorYToLat(yMax); // Note: Y axis is inverted in tile coordinates
    const maxY = this.mercatorYToLat(yMin);
    
    return [minX, minY, maxX, maxY];
  }

  /**
   * Convert normalized Mercator Y coordinate (0-1) to WGS84 latitude
   * @param normalizedY - Normalized Y coordinate [0, 1] where 0=top, 1=bottom
   * @returns Latitude in degrees
   */
  private mercatorYToLat(normalizedY: number): number {
    // Inverse Mercator projection formula
    const n = Math.PI - 2 * Math.PI * normalizedY;
    const latRad = Math.atan(Math.sinh(n));
    return latRad * (180 / Math.PI);
  }
}
