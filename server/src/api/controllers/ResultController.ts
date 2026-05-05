/**
 * Result Controller - Serves generated analysis results
 */

import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

export class ResultController {
  private workspaceBase: string;

  constructor(workspaceBase: string) {
    this.workspaceBase = workspaceBase;
  }

  /**
   * GET /api/results/:id.geojson - Serve GeoJSON result files
   */
  async serveGeoJSON(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Construct file path
      const filePath = path.join(this.workspaceBase, 'results', 'geojson', `${id}.geojson`);
      
      console.log(`[Result Controller] Serving GeoJSON: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          success: false,
          error: 'Result not found',
          message: `No GeoJSON result found with ID: ${id}`
        });
        return;
      }
      
      // Read and serve file
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      res.send(content);
      console.log(`[Result Controller] GeoJSON served successfully: ${id}`);
      
    } catch (error) {
      console.error('[Result Controller] Error serving GeoJSON:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/results/:id.tif - Serve GeoTIFF result files
   */
  async serveGeoTIFF(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Construct file path
      const filePath = path.join(this.workspaceBase, 'results', 'geotiff', `${id}.tif`);
      
      console.log(`[Result Controller] Serving GeoTIFF: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          success: false,
          error: 'Result not found',
          message: `No GeoTIFF result found with ID: ${id}`
        });
        return;
      }
      
      // Stream file for better performance with large files
      res.setHeader('Content-Type', 'image/tiff');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Disposition', `inline; filename="${id}.tif"`);
      
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      
      stream.on('error', (error) => {
        console.error('[Result Controller] Stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'File read error'
          });
        }
      });
      
      console.log(`[Result Controller] GeoTIFF streaming started: ${id}`);
      
    } catch (error) {
      console.error('[Result Controller] Error serving GeoTIFF:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/results/:id/heatmap.geojson - Serve heatmap result files
   */
  async serveHeatmap(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Construct file path
      const filePath = path.join(this.workspaceBase, 'results', 'heatmaps', `${id}.geojson`);
      
      console.log(`[Result Controller] Serving Heatmap: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          success: false,
          error: 'Heatmap not found',
          message: `No heatmap result found with ID: ${id}`
        });
        return;
      }
      
      // Read and serve file
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      res.send(content);
      console.log(`[Result Controller] Heatmap served successfully: ${id}`);
      
    } catch (error) {
      console.error('[Result Controller] Error serving heatmap:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/results/:id/report.html - Serve HTML report files
   */
  async serveReport(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Construct file path
      const filePath = path.join(this.workspaceBase, 'results', 'reports', `${id}.html`);
      
      console.log(`[Result Controller] Serving Report: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          success: false,
          error: 'Report not found',
          message: `No report found with ID: ${id}`
        });
        return;
      }
      
      // Read and serve file
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      res.send(content);
      console.log(`[Result Controller] Report served successfully: ${id}`);
      
    } catch (error) {
      console.error('[Result Controller] Error serving report:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/results/:id/metadata - Get result metadata without downloading file
   */
  async getResultMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Try different result types
      const possiblePaths = [
        { type: 'geojson', path: path.join(this.workspaceBase, 'results', 'geojson', `${id}.geojson`) },
        { type: 'geotiff', path: path.join(this.workspaceBase, 'results', 'geotiff', `${id}.tif`) },
        { type: 'heatmap', path: path.join(this.workspaceBase, 'results', 'heatmaps', `${id}.geojson`) },
        { type: 'report', path: path.join(this.workspaceBase, 'results', 'reports', `${id}.html`) }
      ];
      
      for (const { type, path: filePath } of possiblePaths) {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          
          res.json({
            success: true,
            result: {
              id,
              type,
              size: stats.size,
              createdAt: stats.birthtime,
              modifiedAt: stats.mtime,
              exists: true
            }
          });
          return;
        }
      }
      
      // Not found
      res.status(404).json({
        success: false,
        error: 'Result not found',
        message: `No result found with ID: ${id}`
      });
      
    } catch (error) {
      console.error('[Result Controller] Error getting metadata:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/results/:subdir/:filename - Generic file serving for any result type
   * Handles paths like:
   * - /api/results/reports/report_*.html
   * - /api/results/geojson/stats_*.geojson
   */
  async serveGenericFile(req: Request, res: Response): Promise<void> {
    try {
      const { subdir, filename } = req.params;
      
      // Ensure subdir is a string
      const subdirStr = Array.isArray(subdir) ? subdir[0] : subdir;
      const filenameStr = Array.isArray(filename) ? filename[0] : filename;
      
      // Validate subdir to prevent directory traversal attacks
      const allowedSubdirs = ['reports', 'geojson', 'mvt', 'wms', 'images', 'stats', 'styles'];
      if (!allowedSubdirs.includes(subdirStr)) {
        res.status(400).json({
          success: false,
          error: 'Invalid subdirectory',
          message: `Subdirectory '${subdir}' is not allowed`
        });
        return;
      }
      
      // Construct file path
      const filePath = path.join(this.workspaceBase, 'results', subdirStr, filenameStr);
      
      console.log(`[Result Controller] Serving generic file: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          success: false,
          error: 'File not found',
          message: `No file found at: ${subdir}/${filename}`
        });
        return;
      }
      
      // Determine content type based on file extension
      const ext = path.extname(filenameStr).toLowerCase();
      let contentType = 'application/octet-stream';
      
      switch (ext) {
        case '.html':
          contentType = 'text/html; charset=utf-8';
          break;
        case '.geojson':
        case '.json':
          contentType = 'application/json';
          break;
        case '.pbf':
          contentType = 'application/x-protobuf';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.tif':
        case '.tiff':
          contentType = 'image/tiff';
          break;
      }
      
      // Read and serve file
      const content = fs.readFileSync(filePath);
      
      // Set appropriate headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      res.send(content);
      console.log(`[Result Controller] File served successfully: ${subdir}/${filename}`);
      
    } catch (error) {
      console.error('[Result Controller] Error serving generic file:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
