/**
 * Unified MVT Controller - Single entry point for all MVT operations
 * 
 * Delegates all business logic to VisualizationServicePublisher
 * Only handles HTTP protocol concerns
 */

import type { Request, Response } from 'express';
import { VisualizationServicePublisher } from '../../services/VisualizationServicePublisher';
import type { MVTSource, MVTTileOptions } from '../../publishers/base/MVTPublisherTypes';

export class MVTController {
  private servicePublisher: VisualizationServicePublisher;

  constructor(servicePublisher: VisualizationServicePublisher) {
    this.servicePublisher = servicePublisher;
  }

  /**
   * POST /api/services/mvt/publish - Publish a new MVT service
   * 
   * Request body:
   * {
   *   "source": {
   *     "type": "geojson-file" | "postgis",
   *     "filePath": "...",  // for geojson-file
   *     "connection": {...}, // for postgis
   *     "tableName": "...",  // for postgis
   *     "sqlQuery": "..."    // for postgis (alternative to tableName)
   *   },
   *   "options": {
   *     "minZoom": 0,
   *     "maxZoom": 22,
   *     "extent": 4096,
   *     "layerName": "default"
   *   },
   *   "ttl": 3600000  // Optional, default 1 hour
   * }
   */
  async publish(req: Request, res: Response): Promise<void> {
    try {
      const { source, options, ttl } = req.body;

      // Validate input
      if (!source || !source.type) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: source'
        });
        return;
      }

      // Validate source type
      if (!['geojson-file', 'postgis'].includes(source.type)) {
        res.status(400).json({
          success: false,
          error: `Invalid source type: ${source.type}. Must be one of: geojson-file, postgis`
        });
        return;
      }

      // Additional validation
      if (source.type === 'geojson-file' && !source.filePath) {
        res.status(400).json({
          success: false,
          error: 'geojson-file source requires filePath field'
        });
        return;
      }

      if (source.type === 'postgis') {
        if (!source.connection) {
          res.status(400).json({
            success: false,
            error: 'postgis source requires connection field'
          });
          return;
        }
        
        if (!source.tableName && !source.sqlQuery) {
          res.status(400).json({
            success: false,
            error: 'postgis source requires either tableName or sqlQuery field'
          });
          return;
        }
      }

      // Publish via service layer
      const result = await this.servicePublisher.publishMVT(
        source as MVTSource,
        (options as MVTTileOptions) || {},
        undefined, // Let service generate ID
        ttl // Optional custom TTL
      );

      if (result.success) {
        res.status(201).json({
          success: true,
          data: {
            serviceId: result.serviceId,
            url: result.url,
            metadata: result.metadata
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('[MVT Controller] Publish failed:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/services/mvt - List all MVT services
   */
  async listTilesets(req: Request, res: Response): Promise<void> {
    try {
      const services = this.servicePublisher.listMVTServices();
      
      res.json({
        success: true,
        data: services.map(service => ({
          serviceId: service.id,
          url: service.url,
          createdAt: service.createdAt,
          expiresAt: service.expiresAt,
          accessCount: service.accessCount,
          metadata: service.metadata
        })),
        total: services.length
      });
    } catch (error) {
      console.error('[MVT Controller] List services failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list services',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/services/mvt/:tilesetId/metadata - Get service metadata
   */
  async getMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { tilesetId } = req.params;
      const serviceId = Array.isArray(tilesetId) ? tilesetId[0] : tilesetId;
      
      const metadata = this.servicePublisher.getMVTMetadata(serviceId);
      
      if (!metadata) {
        res.status(404).json({
          success: false,
          error: 'Service not found',
          serviceId
        });
        return;
      }
      
      res.json({
        success: true,
        data: metadata
      });
    } catch (error) {
      console.error('[MVT Controller] Get metadata failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get metadata',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/services/mvt/:tilesetId/:z/:x/:y.pbf - Serve MVT tile
   */
  async serveTile(req: Request, res: Response): Promise<void> {
    try {
      const { tilesetId, z, x, y } = req.params;
      
      const serviceId = Array.isArray(tilesetId) ? tilesetId[0] : tilesetId;
      const zoom = parseInt(Array.isArray(z) ? z[0] : z);
      const tileX = parseInt(Array.isArray(x) ? x[0] : x);
      const tileY = parseInt(Array.isArray(y) ? y[0] : y);
      
      // Validate parameters
      if (isNaN(zoom) || isNaN(tileX) || isNaN(tileY)) {
        res.status(400).json({
          success: false,
          error: 'Invalid tile coordinates'
        });
        return;
      }
      
      // Get tile from service layer
      const tileBuffer = await this.servicePublisher.getMVTTile(
        serviceId,
        zoom,
        tileX,
        tileY
      );
      
      if (!tileBuffer) {
        res.status(404).json({
          success: false,
          error: 'Tile not found',
          serviceId,
          z: zoom,
          x: tileX,
          y: tileY
        });
        return;
      }
      
      // Set appropriate headers for MVT tiles
      res.setHeader('Content-Type', 'application/x-protobuf');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      
      // Send tile data
      res.send(tileBuffer);
      
    } catch (error) {
      console.error('[MVT Controller] Serve tile failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to serve tile',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/services/mvt/:tilesetId - Delete a service
   */
  async deleteTileset(req: Request, res: Response): Promise<void> {
    try {
      const { tilesetId } = req.params;
      const serviceId = Array.isArray(tilesetId) ? tilesetId[0] : tilesetId;
      
      const deleted = this.servicePublisher.deleteMVTService(serviceId);
      
      if (deleted) {
        res.json({
          success: true,
          message: `Service ${serviceId} deleted successfully`
        });
      } else {
        res.status(404).json({
          success: false,
          error: `Service not found: ${serviceId}`
        });
      }
    } catch (error) {
      console.error('[MVT Controller] Delete service failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete service',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
