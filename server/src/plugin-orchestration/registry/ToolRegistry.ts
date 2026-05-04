/**
 * Tool Registry - Manages LangChain Tools converted from GeoAI-UP plugins
 */

import type { DynamicStructuredTool } from '@langchain/core/tools';
import type { Plugin } from '../../core';
import { PluginToolWrapper } from '../tools/PluginToolWrapper.js';

class ToolRegistry {
  private constructor() {}
  private static instance: ToolRegistry;
  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }
  private tools: Map<string, DynamicStructuredTool> = new Map();
  private pluginMap: Map<string, Plugin> = new Map();

  /**
   * Register a plugin as a LangChain Tool
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    try {
      console.log(`[Tool Registry] Registering plugin: ${plugin.name}`);
      
      // Wrap plugin as LangChain Tool
      const tool = PluginToolWrapper.wrapPlugin(plugin);
      
      // Store tool and plugin
      this.tools.set(plugin.id, tool);
      this.pluginMap.set(plugin.id, plugin);
      
      console.log(`[Tool Registry] Successfully registered: ${tool.name}`);
    } catch (error) {
      console.error(`[Tool Registry] Failed to register plugin ${plugin.name}:`, error);
      throw error;
    }
  }

  /**
   * Register multiple plugins
   */
  async registerPlugins(plugins: Plugin[]): Promise<void> {
    console.log(`[Tool Registry] Registering ${plugins.length} plugins...`);
    
    for (const plugin of plugins) {
      await this.registerPlugin(plugin);
    }
    
    console.log(`[Tool Registry] Total tools registered: ${this.tools.size}`);
  }

  /**
   * Unregister a plugin/tool
   */
  unregisterPlugin(pluginId: string): void {
    if (this.tools.has(pluginId)) {
      const plugin = this.pluginMap.get(pluginId);
      this.tools.delete(pluginId);
      this.pluginMap.delete(pluginId);
      console.log(`[Tool Registry] Unregistered: ${plugin?.name || pluginId}`);
    } else {
      console.warn(`[Tool Registry] Plugin not found: ${pluginId}`);
    }
  }

  /**
   * Get a specific tool by plugin ID
   */
  getTool(pluginId: string): DynamicStructuredTool | undefined {
    return this.tools.get(pluginId);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): DynamicStructuredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get plugin information by ID
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.pluginMap.get(pluginId);
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.pluginMap.values());
  }

  /**
   * Check if a plugin is registered
   */
  hasPlugin(pluginId: string): boolean {
    return this.tools.has(pluginId);
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
    this.pluginMap.clear();
    console.log('[Tool Registry] Cleared all tools');
  }

  /**
   * List tools with metadata (for API response)
   */
  listToolsWithMetadata() {
    const result = [];
    
    for (const [pluginId, tool] of this.tools.entries()) {
      const plugin = this.pluginMap.get(pluginId);
      
      result.push({
        id: pluginId,
        name: tool.name,
        description: tool.description,
        category: plugin?.category,
        version: plugin?.version,
        isBuiltin: plugin?.isBuiltin,
        parameters: plugin?.inputSchema
      });
    }
    
    return result;
  }
}
export const ToolRegistryInstance = ToolRegistry.getInstance();
