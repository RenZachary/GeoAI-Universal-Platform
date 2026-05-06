/**
 * Plugin Capability Registry
 * In-memory registry for plugin capabilities, enabling rule-based filtering
 * Supports hot-loading and dynamic capability queries
 */

import type { Plugin } from '../../core/index';

export interface PluginCapability {
  executionCategory: 'statistical' | 'computational' | 'visualization' | 'textual';
  inputRequirements: {
    supportedDataFormats: string[];
    supportedGeometryTypes?: string[];
    requiredFields?: string[];
  };
  outputCapabilities: {
    outputType: string;
    isTerminalNode: boolean;
  };
  scenarios?: string[];
  priority?: number;
}

export interface CapabilityCriteria {
  expectedCategory?: 'statistical' | 'computational' | 'visualization' | 'textual';
  dataFormat?: 'vector' | 'raster';
  geometryType?: string;
  hasNumericField?: boolean;
  hasCategoricalField?: boolean;
  isTerminalAllowed?: boolean; // Whether terminal nodes are allowed in current plan
}

export class PluginCapabilityRegistry {
  private static registry: Map<string, { plugin: Plugin; capability: PluginCapability }> = new Map();
  
  /**
   * Register a plugin with its capability
   */
  static register(pluginId: string, plugin: Plugin, capability: PluginCapability): void {
    if (this.registry.has(pluginId)) {
      console.warn(`[PluginCapabilityRegistry] Plugin ${pluginId} already registered. Overwriting.`);
    }
    
    this.registry.set(pluginId, { plugin, capability });
    console.log(`[PluginCapabilityRegistry] Registered plugin: ${pluginId} (${capability.executionCategory})`);
  }
  
  /**
   * Unregister a plugin
   */
  static unregister(pluginId: string): void {
    if (this.registry.delete(pluginId)) {
      console.log(`[PluginCapabilityRegistry] Unregistered plugin: ${pluginId}`);
    } else {
      console.warn(`[PluginCapabilityRegistry] Plugin ${pluginId} not found for unregistration`);
    }
  }
  
  /**
   * Get capability for a specific plugin
   */
  static getCapability(pluginId: string): PluginCapability | undefined {
    const entry = this.registry.get(pluginId);
    return entry?.capability;
  }
  
  /**
   * Get plugin by ID
   */
  static getPlugin(pluginId: string): Plugin | undefined {
    const entry = this.registry.get(pluginId);
    return entry?.plugin;
  }
  
  /**
   * Filter plugins by capability criteria
   * This is the core method for Stage 1 of two-stage decision process
   */
  static filterByCapability(criteria: CapabilityCriteria): string[] {
    console.log('[PluginCapabilityRegistry] Filtering plugins with criteria:', criteria);
    
    const matchingPlugins: Array<{ id: string; priority: number }> = [];
    
    for (const [pluginId, { plugin, capability }] of this.registry.entries()) {
      // Filter by execution category
      if (criteria.expectedCategory && capability.executionCategory !== criteria.expectedCategory) {
        continue;
      }
      
      // Filter by data format
      if (criteria.dataFormat && !capability.inputRequirements.supportedDataFormats.includes(criteria.dataFormat)) {
        continue;
      }
      
      // Filter by geometry type
      if (criteria.geometryType && capability.inputRequirements.supportedGeometryTypes) {
        if (!capability.inputRequirements.supportedGeometryTypes.includes(criteria.geometryType)) {
          continue;
        }
      }
      
      // Filter terminal nodes if not allowed
      if (criteria.isTerminalAllowed === false && capability.outputCapabilities.isTerminalNode) {
        continue;
      }
      
      // Check required fields (simplified - actual field validation happens in executor)
      if (criteria.hasNumericField && capability.inputRequirements.requiredFields?.includes('numeric_field')) {
        // This plugin requires numeric field, mark as match if criteria indicates numeric field exists
        // Actual field existence check happens later
      }
      
      if (criteria.hasCategoricalField && capability.inputRequirements.requiredFields?.includes('categorical_field')) {
        // This plugin requires categorical field
        // Actual field existence check happens later
      }
      
      matchingPlugins.push({
        id: pluginId,
        priority: capability.priority || 5 // Default priority
      });
    }
    
    // Sort by priority (higher priority first)
    matchingPlugins.sort((a, b) => b.priority - a.priority);
    
    const result = matchingPlugins.map(p => p.id);
    console.log(`[PluginCapabilityRegistry] Found ${result.length} matching plugins:`, result);
    
    return result;
  }
  
  /**
   * Get all registered plugin IDs
   */
  static getAllPluginIds(): string[] {
    return Array.from(this.registry.keys());
  }
  
  /**
   * Get all plugins grouped by execution category
   */
  static getPluginsByCategory(): Record<string, string[]> {
    const categories: Record<string, string[]> = {
      statistical: [],
      computational: [],
      visualization: [],
      textual: []
    };
    
    for (const [pluginId, { capability }] of this.registry.entries()) {
      if (categories[capability.executionCategory]) {
        categories[capability.executionCategory].push(pluginId);
      }
    }
    
    return categories;
  }
  
  /**
   * Clear all registrations (useful for testing)
   */
  static clear(): void {
    this.registry.clear();
    console.log('[PluginCapabilityRegistry] All plugins cleared');
  }
  
  /**
   * Get registry size
   */
  static size(): number {
    return this.registry.size;
  }
}
