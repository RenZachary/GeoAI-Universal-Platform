/**
 * Plugin Capability Registration
 * 
 * Registers all built-in plugins with their capabilities in PluginCapabilityRegistry.
 * This enables the TaskPlanner to perform intelligent plugin filtering during planning phase.
 */

import { PluginCapabilityRegistry } from '../registry/PluginCapabilityRegistry';
import { BUILT_IN_PLUGINS } from '../plugins/index';

/**
 * Register all built-in plugins with their capabilities
 * Call this function during application initialization
 */
export function registerAllPluginCapabilities(): void {
  console.log('[Plugin Capability Registration] Registering all built-in plugin capabilities...');

  // Define capabilities for each plugin based on their characteristics
  const capabilities = {
    // Analysis Plugins - Computational
    'buffer_analysis': {
      executionCategory: 'computational' as const,
      inputRequirements: {
        supportedDataFormats: ['vector'],
        supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon']
      },
      outputCapabilities: {
        outputType: 'native_data',
        isTerminalNode: false
      },
      priority: 5
    },
    'overlay_analysis': {
      executionCategory: 'computational' as const,
      inputRequirements: {
        supportedDataFormats: ['vector'],
        supportedGeometryTypes: ['Polygon', 'MultiPolygon']
      },
      outputCapabilities: {
        outputType: 'native_data',
        isTerminalNode: false
      },
      priority: 5
    },
    
    // Analysis Plugins - Statistical
    'statistics_calculator': {
      executionCategory: 'statistical' as const,
      inputRequirements: {
        supportedDataFormats: ['vector'],
        supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
        requiredFields: ['numeric_field']
      },
      outputCapabilities: {
        outputType: 'text',
        isTerminalNode: false
      },
      priority: 5
    },
    'filter': {
      executionCategory: 'statistical' as const,
      inputRequirements: {
        supportedDataFormats: ['vector'],
        supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon']
      },
      outputCapabilities: {
        outputType: 'native_data',
        isTerminalNode: false
      },
      priority: 5
    },
    'aggregation': {
      executionCategory: 'statistical' as const,
      inputRequirements: {
        supportedDataFormats: ['vector'],
        supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
        requiredFields: ['numeric_field']
      },
      outputCapabilities: {
        outputType: 'native_data',
        isTerminalNode: false
      },
      priority: 5
    },

    // Visualization Plugins - Terminal Nodes
    'heatmap_generator': {
      executionCategory: 'visualization' as const,
      inputRequirements: {
        supportedDataFormats: ['vector'],
        supportedGeometryTypes: ['Point', 'MultiPoint']
      },
      outputCapabilities: {
        outputType: 'geojson',
        isTerminalNode: true
      },
      priority: 7
    },
    'uniform_color_renderer': {
      executionCategory: 'visualization' as const,
      inputRequirements: {
        supportedDataFormats: ['vector'],
        supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon']
      },
      outputCapabilities: {
        outputType: 'native_data',
        isTerminalNode: true
      },
      priority: 8
    },
    'categorical_renderer': {
      executionCategory: 'visualization' as const,
      inputRequirements: {
        supportedDataFormats: ['vector'],
        supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
        requiredFields: ['categorical_field']
      },
      outputCapabilities: {
        outputType: 'native_data',
        isTerminalNode: true
      },
      priority: 8
    },
    'choropleth_renderer': {
      executionCategory: 'visualization' as const,
      inputRequirements: {
        supportedDataFormats: ['vector'],
        supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
        requiredFields: ['numeric_field']
      },
      outputCapabilities: {
        outputType: 'native_data',
        isTerminalNode: true
      },
      priority: 9
    },

    // Query Plugins - Utility
    'data_source_query': {
      executionCategory: 'statistical' as const,
      inputRequirements: {
        supportedDataFormats: ['vector', 'raster']
      },
      outputCapabilities: {
        outputType: 'native_data',
        isTerminalNode: true  // ← 改为 true，作为最终输出
      },
      priority: 8
    },
    'general_qa': {
      executionCategory: 'computational' as const,
      inputRequirements: {
        supportedDataFormats: ['vector', 'raster']
      },
      outputCapabilities: {
        outputType: 'native_data',
        isTerminalNode: false
      },
      priority: 7
    }
  };

  // Register each plugin with its capability
  let registeredCount = 0;
  for (const plugin of BUILT_IN_PLUGINS) {
    const capability = (capabilities as any)[plugin.id];
    
    if (capability) {
      PluginCapabilityRegistry.register(plugin.id, plugin, capability);
      registeredCount++;
    } else {
      console.warn(`[Plugin Capability Registration] No capability defined for plugin: ${plugin.id}`);
    }
  }

  console.log(`[Plugin Capability Registration] Successfully registered ${registeredCount} plugin capabilities`);
  //console.log('[Plugin Capability Registration] Registered plugin IDs:', PluginCapabilityRegistry.getAllPluginIds());
  
  // Log summary by category
  const byCategory = PluginCapabilityRegistry.getPluginsByCategory();
  console.log('[Plugin Capability Registration] Plugins by category:', {
    computational: byCategory.computational,
    statistical: byCategory.statistical,
    visualization: byCategory.visualization,
    textual: byCategory.textual
  });
}
