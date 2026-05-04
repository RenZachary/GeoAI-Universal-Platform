/**
 * Tool Controller - Manages plugin tools via API
 */

import type { Request, Response } from 'express';
import { ToolRegistryInstance } from '../../plugin-orchestration';
import { BUILT_IN_PLUGINS, PluginToolWrapper } from '../../plugin-orchestration';
import { SQLiteManagerInstance } from '../../storage';

export class ToolController {

  constructor() {    
    // Initialize PluginToolWrapper with database connection
    PluginToolWrapper.initialize(SQLiteManagerInstance.getDatabase());
  }

  /**
   * Initialize built-in plugins as tools
   */
  async initialize(): Promise<void> {
    console.log('[Tool Controller] Initializing built-in tools...');
    await ToolRegistryInstance.registerPlugins(BUILT_IN_PLUGINS);
    console.log(`[Tool Controller] Registered ${ToolRegistryInstance.getToolCount()} tools`);
  }

  /**
   * GET /api/tools - List all available tools
   */
  async listTools(req: Request, res: Response): Promise<void> {
    try {
      const tools = ToolRegistryInstance.listToolsWithMetadata();

      res.json({
        success: true,
        count: tools.length,
        tools
      });

    } catch (error) {
      console.error('[Tool Controller] Error listing tools:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/tools/:id - Get specific tool details
   */
  async getTool(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const pluginId = Array.isArray(id) ? id[0] : id;
      const plugin = ToolRegistryInstance.getPlugin(pluginId);

      if (!plugin) {
        res.status(404).json({
          success: false,
          error: `Tool not found: ${id}`
        });
        return;
      }

      const tool = ToolRegistryInstance.getTool(pluginId);

      res.json({
        success: true,
        tool: {
          id: plugin.id,
          name: tool?.name || plugin.name,
          description: tool?.description || plugin.description,
          category: plugin.category,
          version: plugin.version,
          isBuiltin: plugin.isBuiltin,
          inputSchema: plugin.inputSchema,
          outputSchema: plugin.outputSchema,
          capabilities: plugin.capabilities
        }
      });

    } catch (error) {
      console.error('[Tool Controller] Error getting tool:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/tools/:id/execute - Execute a tool manually
   */
  async executeTool(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const toolId = Array.isArray(id) ? id[0] : id;
      const parameters = req.body;

      const tool = ToolRegistryInstance.getTool(toolId);

      if (!tool) {
        res.status(404).json({
          success: false,
          error: `Tool not found: ${id}`
        });
        return;
      }

      console.log(`[Tool Controller] Executing tool: ${id}`);

      // Execute the tool
      const result = await tool.invoke(parameters);

      res.json({
        success: true,
        toolId: toolId,
        result: JSON.parse(result as string)
      });

    } catch (error) {
      console.error('[Tool Controller] Error executing tool:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/tools/register - Register a custom plugin as tool
   */
  async registerTool(req: Request, res: Response): Promise<void> {
    try {
      const pluginData = req.body;

      // TODO: Validate plugin data structure
      // TODO: Load plugin implementation from file

      // For now, create a mock plugin
      const mockPlugin = {
        ...pluginData,
        id: pluginData.id || `plugin_${Date.now()}`,
        isBuiltin: false,
        installedAt: new Date()
      };

      await ToolRegistryInstance.registerPlugin(mockPlugin);

      res.json({
        success: true,
        message: 'Tool registered successfully',
        toolId: mockPlugin.id
      });

    } catch (error) {
      console.error('[Tool Controller] Error registering tool:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/tools/:id - Unregister a tool
   */
  async unregisterTool(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const pluginId = Array.isArray(id) ? id[0] : id;

      if (!ToolRegistryInstance.hasPlugin(pluginId)) {
        res.status(404).json({
          success: false,
          error: `Tool not found: ${id}`
        });
        return;
      }

      ToolRegistryInstance.unregisterPlugin(pluginId);

      res.json({
        success: true,
        message: `Tool unregistered: ${pluginId}`
      });

    } catch (error) {
      console.error('[Tool Controller] Error unregistering tool:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
