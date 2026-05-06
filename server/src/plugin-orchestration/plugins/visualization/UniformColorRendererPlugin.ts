/**
 * Uniform Color Renderer Plugin
 * Displays all features with a single uniform color
 * Supports Point, LineString, and Polygon geometry types
 */

import type { Plugin } from '../../../core/index';

export const UniformColorRendererPlugin: Plugin = {
  id: 'uniform_color_renderer',
  name: 'Uniform Color Renderer',
  version: '1.0.0',
  description: 'Renders all geographic features with a single uniform color. Supports point, line, and polygon geometries.',
  category: 'visualization',
  
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'string',
      required: true,
      description: 'ID of the data source to render'
    },
    {
      name: 'color',
      type: 'string',
      required: false,
      defaultValue: '#409eff',
      description: 'Color specification (hex code, CSS color name, Chinese color word, or ramp name). Default: #409eff'
    },
    {
      name: 'strokeWidth',
      type: 'number',
      required: false,
      defaultValue: 2,
      description: 'Stroke width for lines and polygons (0.5-20). Default: 2',
      validation: { min: 0.5, max: 20 }
    },
    {
      name: 'pointSize',
      type: 'number',
      required: false,
      defaultValue: 5,
      description: 'Point size for point geometries (1-50). Default: 5',
      validation: { min: 1, max: 50 }
    },
    {
      name: 'opacity',
      type: 'number',
      required: false,
      defaultValue: 0.8,
      description: 'Opacity value (0-1). Default: 0.8',
      validation: { min: 0, max: 1 }
    },
    {
      name: 'layerName',
      type: 'string',
      required: false,
      defaultValue: 'uniform',
      description: 'Custom layer name. Default: "uniform"'
    },
    {
      name: 'minZoom',
      type: 'number',
      required: false,
      defaultValue: 0,
      description: 'Minimum zoom level. Default: 0'
    },
    {
      name: 'maxZoom',
      type: 'number',
      required: false,
      defaultValue: 22,
      description: 'Maximum zoom level. Default: 22'
    }
  ],
  
  outputSchema: {
    type: 'native_data',
    description: 'MVT tile service with uniform styling',
    outputFields: [
      { name: 'tilesetId', type: 'string', description: 'Unique identifier for the MVT tileset' },
      { name: 'styleUrl', type: 'string', description: 'URL to the Mapbox style JSON' },
      { name: 'serviceUrl', type: 'string', description: 'Base URL for the MVT service' },
      { name: 'rendererType', type: 'string', description: 'Type of renderer used', example: 'uniform' }
    ]
  },
  
  capabilities: [
    'visualization',
    'mvt_output',
    'terminal_node',
    'supports_points',
    'supports_lines',
    'supports_polygons',
    'single_color'
  ],
  
  isBuiltin: true,
  installedAt: new Date()
};
