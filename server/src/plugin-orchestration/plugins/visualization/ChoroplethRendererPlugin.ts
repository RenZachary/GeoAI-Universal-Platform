/**
 * Choropleth Renderer Plugin
 * Creates graduated color maps based on numeric field values
 */

import type { Plugin } from '../../../core/index';

export const ChoroplethRendererPlugin: Plugin = {
  id: 'choropleth_renderer',
  name: 'Choropleth Renderer',
  version: '1.0.0',
  description: 'Creates statistical choropleth maps with graduated colors based on numeric field values. Supports multiple classification methods.',
  category: 'visualization',
  
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'string',
      required: true,
      description: 'ID of the data source to render'
    },
    {
      name: 'valueField',
      type: 'string',
      required: true,
      description: 'Name of the numeric field to use for classification'
    },
    {
      name: 'classification',
      type: 'string',
      required: false,
      defaultValue: 'quantile',
      description: 'Classification method (quantile, equal_interval, standard_deviation, jenks)',
      validation: { enum: ['quantile', 'equal_interval', 'standard_deviation', 'jenks'] }
    },
    {
      name: 'numClasses',
      type: 'number',
      required: false,
      defaultValue: 5,
      description: 'Number of classification classes (3-9)',
      validation: { min: 3, max: 9 }
    },
    {
      name: 'colorRamp',
      type: 'string',
      required: false,
      defaultValue: 'greens',
      description: 'Color ramp name (reds, greens, blues, oranges, purples, ylorbr, greys, viridis)'
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
      defaultValue: 'choropleth',
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
    description: 'MVT tile service with statistical choropleth styling and legend',
    outputFields: [
      { name: 'tilesetId', type: 'string', description: 'Unique identifier for the MVT tileset' },
      { name: 'styleUrl', type: 'string', description: 'URL to the Mapbox style JSON' },
      { name: 'serviceUrl', type: 'string', description: 'Base URL for the MVT service' },
      { name: 'rendererType', type: 'string', description: 'Type of renderer used', example: 'choropleth' },
      { name: 'valueField', type: 'string', description: 'Field used for classification' },
      { name: 'classification', type: 'string', description: 'Classification method used' },
      { name: 'breaks', type: 'array', description: 'Classification break values' }
    ]
  },
  
  capabilities: [
    'visualization',
    'mvt_output',
    'terminal_node',
    'supports_points',
    'supports_lines',
    'supports_polygons',
    'statistical_classification',
    'requires_numeric_field'
  ],
  
  isBuiltin: true,
  installedAt: new Date()
};
