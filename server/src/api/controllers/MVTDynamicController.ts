/**
 * MVT Dynamic Publisher Controller - REST API for dynamic MVT services
 */

import type { Request, Response } from 'express';
import type { MVTSource, MVTTileOptions } from '../../utils/publishers/MVTDynamicPublisher';
import type { MVTDynamicPublisher } from '../../utils/publishers/MVTDynamicPublisher';
import type Database from 'better-sqlite3';

export class MVTDynamicController {
  private publisher: MVTDynamicPublisher;
  private db?: Database.Database;

  constructor(publisher: MVTDynamicPublisher, db?: Database.Database) {
    this.publisher = publisher;
    this.db = db;
    
    console.log('[MVT Dynamic Controller] Initialized');
  }

  /**
   * POST /api/mvt-dynamic/publish - Publish a new MVT service
   * 
   * Request body examples:
   * 
   * 1. GeoJSON in-memory:
   * {
   *   "source": {
   *     "type": "geojson-memory",
   *     "featureCollection": { ... }
   *   },
   *   "options": {
   *     "minZoom": 0,
   *     "maxZoom": 10,
   *     "layerName": "my_layer"
   *   }
   * }
   * 
   * 2. GeoJSON file:
   * {
   *   "source": {
   *     "type": "geojson-file",
   *     "filePath": "/path/to/file.geojson"
   *   },
   *   "options": { ... }
   * }
   * 
   * 3. PostGIS table:
   * {
   *   "source": {
   *     "type": "postgis",
   *     "connection": {
   *       "host": "localhost",
   *       "port": 5432,
   *       "database": "gis_db",
   *       "user": "postgres",
   *       "password": "password"
   *     },
   *     "tableName": "provinces",
   *     "geometryColumn": "geom"
   *   },
   *   "options": { ... }
   * }
   * 
   * 4. PostGIS custom SQL:
   * {
   *   "source": {
   *     "type": "postgis",
   *     "connection": { ... },
   *     "sqlQuery": "SELECT geom, name FROM cities WHERE population > 1000000"
   *   },
   *   "options": { ... }
   * }
   */
  async publish(req: Request, res: Response): Promise<void> {
    try {
      const { source, options } = req.body;

      // Validate input
      if (!source || !source.type) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: source'
        });
        return;
      }

      // Validate source type
      if (!['geojson-memory', 'geojson-file', 'postgis'].includes(source.type)) {
        res.status(400).json({
          success: false,
          error: `Invalid source type: ${source.type}. Must be one of: geojson-memory, geojson-file, postgis`
        });
        return;
      }

      // Additional validation based on source type
      if (source.type === 'geojson-memory' && !source.featureCollection) {
        res.status(400).json({
          success: false,
          error: 'geojson-memory source requires featureCollection field'
        });
        return;
      }

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

      // Publish the MVT service
      const result = await this.publisher.publish(source as MVTSource, options as MVTTileOptions);

      if (result.success) {
        res.status(201).json({
          success: true,
          data: {
            tilesetId: result.tilesetId,
            serviceUrl: result.serviceUrl,
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
      console.error('[MVT Dynamic Controller] Publish failed:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/mvt-dynamic/:tilesetId/:z/:x/:y.pbf - Get MVT tile
   */
  async getTile(req: Request, res: Response): Promise<void> {
    try {
      const { tilesetId, z, x, y } = req.params;
      
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
      
      const tileId = Array.isArray(tilesetId) ? tilesetId[0] : tilesetId;
      
      // Get tile
      const tileBuffer = await this.publisher.getTile(tileId, zoom, tileX, tileY);
      
      if (!tileBuffer) {
        res.status(404).json({
          success: false,
          error: 'Tile not found',
          tilesetId,
          z: zoom,
          x: tileX,
          y: tileY
        });
        return;
      }
      
      // Set appropriate headers for MVT tiles
      res.setHeader('Content-Type', 'application/x-protobuf');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      
      res.send(tileBuffer);
    } catch (error) {
      console.error('[MVT Dynamic Controller] Get tile failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tile',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/mvt-dynamic/list - List all published tilesets
   */
  async listTilesets(req: Request, res: Response): Promise<void> {
    try {
      const tilesets = this.publisher.listTilesets();
      
      res.json({
        success: true,
        data: {
          count: tilesets.length,
          tilesets: tilesets.map((ts: any) => ({
            tilesetId: ts.tilesetId,
            serviceUrl: `/api/mvt-dynamic/${ts.tilesetId}/{z}/{x}/{y}.pbf`,
            metadata: ts.metadata
          }))
        }
      });
    } catch (error) {
      console.error('[MVT Dynamic Controller] List tilesets failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list tilesets',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/mvt-dynamic/:tilesetId - Delete a published tileset
   */
  async deleteTileset(req: Request, res: Response): Promise<void> {
    try {
      const { tilesetId } = req.params;
      const tileId = Array.isArray(tilesetId) ? tilesetId[0] : tilesetId;
      
      const deleted = this.publisher.deleteTileset(tileId);
      
      if (deleted) {
        res.json({
          success: true,
          message: `Tileset deleted: ${tileId}`
        });
      } else {
        res.status(404).json({
          success: false,
          error: `Tileset not found: ${tileId}`
        });
      }
    } catch (error) {
      console.error('[MVT Dynamic Controller] Delete tileset failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete tileset',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/mvt-dynamic/:tilesetId/metadata - Get tileset metadata
   */
  async getMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { tilesetId } = req.params;
      const tileId = Array.isArray(tilesetId) ? tilesetId[0] : tilesetId;
      
      const tilesets = this.publisher.listTilesets();
      const tileset = tilesets.find((ts: any) => ts.tilesetId === tileId);
      
      if (!tileset) {
        res.status(404).json({
          success: false,
          error: `Tileset not found: ${tileId}`
        });
        return;
      }
      
      res.json({
        success: true,
        data: {
          tilesetId: tileset.tilesetId,
          serviceUrl: `/api/mvt-dynamic/${tileset.tilesetId}/{z}/{x}/{y}.pbf`,
          metadata: tileset.metadata
        }
      });
    } catch (error) {
      console.error('[MVT Dynamic Controller] Get metadata failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get metadata',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
