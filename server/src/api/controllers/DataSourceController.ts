/**
 * Data Source Controller - HTTP Layer for Data Source Management
 * 
 * Responsibilities:
 * - HTTP request/response handling
 * - Input validation (Zod schemas)
 * - Response formatting
 * - Error handling (HTTP status codes)
 * 
 * Note: All business logic delegated to DataSourceService
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import type { DataSourceService } from '../../services';
import { ConnectionError, ValidationError } from '../../services/DataSourceService';
import { DataSourcePublishingService } from '../../services/DataSourcePublishingService';
import type { DataSourceRecord } from '../../data-access/repositories';
import type Database from 'better-sqlite3';
import type { MVTOnDemandPublisher } from '../../utils/publishers/MVTOnDemandPublisher';

// ============================================================================
// Validation Schemas
// ============================================================================

const PostGISConnectionSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().min(1).max(65535).optional().default(5432),
  database: z.string().min(1, 'Database name is required'),
  user: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  schema: z.string().optional().default('public'),
  name: z.string().optional()
});

const UpdateMetadataSchema = z.object({
  metadata: z.record(z.any())
});

// ============================================================================
// Controller Implementation
// ============================================================================

export class DataSourceController {
  private dataSourceService: DataSourceService;
  private publishingService: DataSourcePublishingService;

  constructor(dataSourceService: DataSourceService, db: Database.Database, workspaceBase: string) {
    this.dataSourceService = dataSourceService;
    this.publishingService = new DataSourcePublishingService(db, workspaceBase);
  }

  /**
   * List all registered data sources
   * GET /api/data-sources
   */
  async listDataSources(req: Request, res: Response): Promise<void> {
    try {
      const sources = await this.dataSourceService.listDataSources();
      
      res.json({
        success: true,
        count: sources.length,
        dataSources: sources.map((source: DataSourceRecord) => ({
          id: source.id,
          name: source.name,
          type: source.type,
          reference: source.reference,
          metadata: source.metadata,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt
        }))
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get available data sources for LLM context injection
   * GET /api/data-sources/available
   */
  async getAvailableDataSources(req: Request, res: Response): Promise<void> {
    try {
      const availableSources = await this.dataSourceService.getAvailableDataSources();
      
      res.json({
        success: true,
        count: availableSources.length,
        availableSources
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get data source by ID
   * GET /api/data-sources/:id
   */
  async getDataSource(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dataSourceId = Array.isArray(id) ? id[0] : id;
      
      const source = await this.dataSourceService.getDataSourceById(dataSourceId);
      
      if (!source) {
        res.status(404).json({
          success: false,
          error: `Data source not found: ${dataSourceId}`
        });
        return;
      }
      
      res.json({
        success: true,
        dataSource: source
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get data source schema
   * GET /api/data-sources/:id/schema
   */
  async getDataSourceSchema(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dataSourceId = Array.isArray(id) ? id[0] : id;
      
      const schema = await this.dataSourceService.extractSchema(dataSourceId);
      
      res.json({
        success: true,
        dataSourceId,
        schema
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Register a new data source manually
   * POST /api/data-sources
   */
  async registerDataSource(req: Request, res: Response): Promise<void> {
    try {
      const { name, type, reference, metadata } = req.body;
      
      // Validate required fields
      if (!name || !type || !reference) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: name, type, and reference are required'
        });
        return;
      }
      
      // Validate type
      const validTypes = ['shapefile', 'geojson', 'postgis', 'tif', 'mvt', 'wms'];
      if (!validTypes.includes(type)) {
        res.status(400).json({
          success: false,
          error: `Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`
        });
        return;
      }
      
      // Check if reference exists (for file-based types)
      if (['shapefile', 'geojson', 'tif'].includes(type)) {
        if (!fs.existsSync(reference)) {
          res.status(400).json({
            success: false,
            error: `File not found: ${reference}`
          });
          return;
        }
      }
      
      // Register data source
      const dataSource = this.dataSourceService.registerManualDataSource({
        name,
        type: type as any,
        reference,
        metadata: metadata || {}
      });
      
      res.status(201).json({
        success: true,
        data: dataSource
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Register PostGIS connection and discover spatial tables
   * POST /api/data-sources/postgis
   */
  async registerPostGISConnection(req: Request, res: Response): Promise<void> {
    try {
      // Validate input
      const config = PostGISConnectionSchema.parse(req.body);
      
      console.log(`[DataSourceController] Registering PostGIS connection to ${config.host}:${config.port}/${config.database}`);
      
      // Delegate to service
      const result = await this.dataSourceService.registerPostGISConnection(config);
      
      console.log(`[DataSourceController] Successfully registered ${result.dataSources.length} tables`);
      
      res.status(201).json({
        success: true,
        message: `Successfully connected and registered ${result.dataSources.length} spatial tables`,
        connectionInfo: result.connectionInfo,
        dataSources: result.dataSources
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      } else {
        this.handleError(res, error);
      }
    }
  }

  /**
   * Update data source metadata
   * PUT /api/data-sources/:id/metadata
   */
  async updateMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dataSourceId = Array.isArray(id) ? id[0] : id;
      
      // Validate input
      const { metadata } = UpdateMetadataSchema.parse(req.body);
      
      await this.dataSourceService.updateMetadata(dataSourceId, metadata);
      
      res.json({
        success: true,
        message: 'Metadata updated successfully'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
      } else {
        this.handleError(res, error);
      }
    }
  }

  /**
   * Delete data source
   * DELETE /api/data-sources/:id
   */
  async deleteDataSource(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dataSourceId = Array.isArray(id) ? id[0] : id;
      
      await this.dataSourceService.deleteDataSource(dataSourceId);
      
      res.json({
        success: true,
        message: 'Data source deleted successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get list of PostGIS connections
   * GET /api/data-sources/connections
   */
  async getPostGISConnections(req: Request, res: Response): Promise<void> {
    try {
      const connections = this.dataSourceService.getPostGISConnections();
      
      res.json({
        success: true,
        connections
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Remove PostGIS connection and all its tables
   * DELETE /api/data-sources/connections/:connectionId
   */
  async removePostGISConnection(req: Request, res: Response): Promise<void> {
    try {
      const { connectionId } = req.params;
      const id = Array.isArray(connectionId) ? connectionId[0] : connectionId;
      
      await this.dataSourceService.removePostGISConnection(id);
      
      res.json({
        success: true,
        message: 'PostGIS connection removed successfully'
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Search data sources by name
   * GET /api/data-sources/search?q=query
   */
  async searchDataSources(req: Request, res: Response): Promise<void> {
    try {
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Search query parameter "q" is required'
        });
        return;
      }
      
      const sources = await this.dataSourceService.searchDataSources(q);
      
      res.json({
        success: true,
        count: sources.length,
        query: q,
        dataSources: sources
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  /**
   * Get service URL for a data source (auto-publish if needed)
   * GET /api/data-sources/:id/service-url
   */
  async getServiceUrl(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dataSourceId = Array.isArray(id) ? id[0] : id;
      
      const serviceInfo = await this.publishingService.getServiceUrl(dataSourceId);
      
      res.json({
        success: true,
        dataSourceId,
        serviceUrl: serviceInfo.url,
        serviceType: serviceInfo.type
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ==========================================================================
  // Private Methods - Error Handling
  // ==========================================================================

  /**
   * Unified error handler for all controller methods
   * Maps service errors to appropriate HTTP status codes
   */
  private handleError(res: Response, error: unknown): void {
    console.error('[DataSourceController] Error:', error);
    
    if (error instanceof ConnectionError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    } else if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    } else if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }
}
