/**
 * Plugin Management Controller
 * Handles plugin lifecycle operations: list, enable, disable, delete, upload
 */

import type { Request, Response } from 'express';
import type { CustomPluginLoader } from '../../plugin-orchestration';

export class PluginManagementController {
  private pluginLoader: CustomPluginLoader;

  constructor(pluginLoader: CustomPluginLoader) {
    this.pluginLoader = pluginLoader;
  }

  /**
   * GET /api/plugins - List all custom plugins with status
   */
  async listPlugins(req: Request, res: Response): Promise<void> {
    try {
      const plugins = this.pluginLoader.getAllPluginStatuses();
      
      res.json({
        success: true,
        data: plugins,
        total: plugins.length
      });
    } catch (error) {
      console.error('[PluginManagementController] Error listing plugins:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list plugins',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/plugins/:id/disable - Disable a plugin
   */
  async disablePlugin(req: Request, res: Response): Promise<void> {
    try {
      const pluginId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      
      await this.pluginLoader.disablePlugin(pluginId);
      
      res.json({
        success: true,
        message: `Plugin ${pluginId} disabled successfully`
      });
    } catch (error) {
      console.error(`[PluginManagementController] Error disabling plugin ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to disable plugin',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/plugins/:id/enable - Enable a plugin
   */
  async enablePlugin(req: Request, res: Response): Promise<void> {
    try {
      const pluginId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      
      await this.pluginLoader.enablePlugin(pluginId);
      
      res.json({
        success: true,
        message: `Plugin ${pluginId} enabled successfully`
      });
    } catch (error) {
      console.error(`[PluginManagementController] Error enabling plugin ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to enable plugin',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/plugins/:id - Delete a plugin
   */
  async deletePlugin(req: Request, res: Response): Promise<void> {
    try {
      const pluginId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      
      await this.pluginLoader.deletePlugin(pluginId);
      
      res.json({
        success: true,
        message: `Plugin ${pluginId} deleted successfully`
      });
    } catch (error) {
      console.error(`[PluginManagementController] Error deleting plugin ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete plugin',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/plugins/upload - Upload and install a new plugin
   */
  async uploadPlugin(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Implement file upload handling with multer
      // For now, return placeholder response
      res.status(501).json({
        success: false,
        error: 'Plugin upload not yet implemented',
        message: 'Please place plugin files directly in workspace/plugins/custom/ directory'
      });
    } catch (error) {
      console.error('[PluginManagementController] Error uploading plugin:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to upload plugin',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/plugins/scan - Rescan plugins directory
   */
  async scanPlugins(req: Request, res: Response): Promise<void> {
    try {
      await this.pluginLoader.loadAllPlugins();
      
      const plugins = this.pluginLoader.getAllPluginStatuses();
      
      res.json({
        success: true,
        message: 'Plugins scanned successfully',
        data: plugins,
        total: plugins.length
      });
    } catch (error) {
      console.error('[PluginManagementController] Error scanning plugins:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to scan plugins',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
