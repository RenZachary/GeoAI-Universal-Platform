/**
 * Categorical Renderer Plugin
 * Colors features based on categorical/string field values
 */

import type { Plugin } from '../../../core/index';

export const CategoricalRendererPlugin: Plugin = {
  id: 'categorical_renderer',
  name: 'Categorical Renderer',
  version: '1.0.0',
  description: 'Renders features with different colors based on categorical field values. Creates a legend mapping categories to colors.',
  category: 'visualization',
  
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'string',
      required: true,
      description: 'ID of the data source to render'
    },
    {
      name: 'categoryField',
      type: 'string',
      required: true,
      description: 'Name of the categorical/string field to use for coloring'
    },
    {
      name: 'colorScheme',
      type: 'string',
      required: false,
      defaultValue: 'set1',
      description: 'Predefined color scheme (set1, set2, set3, pastel1, pastel2, dark2, paired, accent)'
    },
    {
      name: 'opacity',
      type: 'number',
      required: false,
      defaultValue: 0.8,
      description: 'Opacity value (0-1)',
      validation: { min: 0, max: 1 }
    },
    {
      name: 'layerName',
      type: 'string',
      required: false,
      defaultValue: 'categorical',
      description: 'Custom layer name'
    },
    {
      name: 'minZoom',
      type: 'number',
      required: false,
      defaultValue: 0,
      description: 'Minimum zoom level'
    },
    {
      name: 'maxZoom',
      type: 'number',
      required: false,
      defaultValue: 22,
      description: 'Maximum zoom level'
    }
  ],
  
  outputSchema: {
    type: 'native_data',
    description: 'MVT tile service with categorical coloring and legend',
    outputFields: [
      { name: 'tilesetId', type: 'string', description: 'Unique identifier for the MVT tileset' },
      { name: 'styleUrl', type: 'string', description: 'URL to the Mapbox style JSON' },
      { name: 'serviceUrl', type: 'string', description: 'Base URL for the MVT service' },
      { name: 'rendererType', type: 'string', description: 'Type of renderer used', example: 'categorical' },
      { name: 'categoryField', type: 'string', description: 'Field used for categorization' },
      { name: 'categories', type: 'array', description: 'List of unique categories found' }
    ]
  },
  
  capabilities: [
    'visualization',
    'mvt_output',
    'terminal_node',
    'supports_points',
    'supports_lines',
    'supports_polygons',
    'categorical_coloring',
    'requires_string_field'
  ],
  
  isBuiltin: true,
  installedAt: new Date()
};
