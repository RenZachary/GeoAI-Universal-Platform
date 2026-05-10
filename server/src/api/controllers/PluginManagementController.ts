/**
 * Plugin Management Controller
 * Handles plugin lifecycle operations: list, enable, disable, delete, upload
 */

import type { Request, Response } from 'express';
import type { CustomPluginLoader } from '../../spatial-operators/plugins/CustomPluginLoader';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { WorkspaceManagerInstance } from '../../storage';

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
   * Expects multipart form data with 'plugin' field (zip file)
   */
  async uploadPlugin(req: Request, res: Response): Promise<void> {
    try {
      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file uploaded',
          message: 'Please provide a plugin archive file (.zip or .tar.gz)'
        });
        return;
      }

      const uploadedFile = req.file;
      
      // Use WorkspaceManager for unified temp directory management
      const tempDir = WorkspaceManagerInstance.getDirectoryPath('TEMP');
      
      // Temp directory is already ensured by WorkspaceManager.initialize()
      // No need to check/create it here

      // Generate unique temp filename
      const tempFilename = `plugin_${uuidv4()}${path.extname(uploadedFile.originalname)}`;
      const tempPath = path.join(tempDir, tempFilename);

      // Write uploaded file to temp location
      fs.writeFileSync(tempPath, uploadedFile.buffer);

      console.log(`[PluginManagementController] Plugin uploaded to: ${tempPath}`);

      try {
        // Attempt to install from archive
        const pluginId = await this.pluginLoader.installFromArchive(tempPath);
        
        // Clean up temp file
        fs.unlinkSync(tempPath);

        res.json({
          success: true,
          message: 'Plugin installed successfully',
          data: {
            pluginId,
            originalName: uploadedFile.originalname
          }
        });
      } catch (installError) {
        // If archive installation fails, clean up and return helpful error
        fs.unlinkSync(tempPath);
        
        const errorMessage = installError instanceof Error ? installError.message : String(installError);
        
        res.status(400).json({
          success: false,
          error: 'Failed to install plugin from archive',
          message: errorMessage,
          suggestion: 'Please extract the plugin manually to workspace/plugins/custom/ directory'
        });
      }
    } catch (error) {
      console.error('[PluginManagementController] Error uploading plugin:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during plugin upload',
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
