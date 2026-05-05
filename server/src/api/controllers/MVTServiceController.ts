/**
 * MVT Service Controller - Serves Mapbox Vector Tiles
 */

import type { Request, Response } from 'express';
import { MVTPublisher } from '../../utils/publishers/MVTPublisher.js';
import type Database from 'better-sqlite3';


export class MVTServiceController {
  private mvtPublisher: MVTPublisher;

  constructor(workspaceBase: string, db?: Database.Database) {
    // Use singleton instance to share tile cache with MVTPublisherExecutor
    this.mvtPublisher = MVTPublisher.getInstance(workspaceBase, db);
  }

  /**
   * GET /api/services/mvt/:tilesetId/:z/:x/:y.pbf - Serve MVT tile
   */
  async serveTile(req: Request, res: Response): Promise<void> {
    try {
      const { tilesetId, z, x, y } = req.params;
      
      const tileId = Array.isArray(tilesetId) ? tilesetId[0] : tilesetId;
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
      
      // Get tile from publisher (supports both pre-generated and on-demand)
      const tileBuffer = await this.mvtPublisher.getTile(tileId, zoom, tileX, tileY);
      
      if (!tileBuffer) {
        res.status(404).json({
          success: false,
          error: 'Tile not found',
          tilesetId: tileId,
          z: zoom,
          x: tileX,
          y: tileY
        });
        return;
      }
      
      // Set appropriate headers for MVT tiles
      res.setHeader('Content-Type', 'application/x-protobuf');
      // Note: Do NOT set Content-Encoding unless actually compressing the data
      // The PBF buffer from MVTPublisher is uncompressed
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      
      // Send tile data
      res.send(tileBuffer);
      
    } catch (error) {
      console.error('[MVT Service] Error serving tile:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to serve tile',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/services/mvt/:tilesetId/metadata - Get tileset metadata
   */
  async getMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { tilesetId } = req.params;
      
      const tileId = Array.isArray(tilesetId) ? tilesetId[0] : tilesetId;
      const metadata = this.mvtPublisher.getMetadata(tileId);
      
      if (!metadata) {
        res.status(404).json({
          success: false,
          error: 'Tileset not found',
          tilesetId: tileId
        });
        return;
      }
      
      res.json({
        success: true,
        data: metadata
      });
      
    } catch (error) {
      console.error('[MVT Service] Error getting metadata:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get metadata',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/services/mvt - List all available tilesets
   */
  async listTilesets(req: Request, res: Response): Promise<void> {
    try {
      const tilesets = this.mvtPublisher.listTilesets();
      
      res.json({
        success: true,
        data: tilesets,
        total: tilesets.length
      });
      
    } catch (error) {
      console.error('[MVT Service] Error listing tilesets:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list tilesets',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/services/mvt/:tilesetId - Delete a tileset
   */
  async deleteTileset(req: Request, res: Response): Promise<void> {
    try {
      const { tilesetId } = req.params;
      
      const tileId = Array.isArray(tilesetId) ? tilesetId[0] : tilesetId;
      this.mvtPublisher.deleteTileset(tileId);
      
      res.json({
        success: true,
        message: `Tileset ${tileId} deleted successfully`
      });
      
    } catch (error) {
      console.error('[MVT Service] Error deleting tileset:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete tileset',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
