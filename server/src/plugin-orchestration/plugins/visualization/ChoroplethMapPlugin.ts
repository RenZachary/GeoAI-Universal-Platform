/**
 * Choropleth Map Plugin
 * Generates choropleth thematic maps as MVT services with automatic classification and styling
 */

import type { Plugin } from '../../../core/index.js';

export const ChoroplethMapPlugin: Plugin = {
  id: 'choropleth_map',
  name: 'Choropleth Map Generator',
  version: '1.0.0',
  description: 'Generate choropleth thematic map as MVT service with automatic classification and styling',
  category: 'visualization',
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'data_reference',
      required: true,
      description: 'ID of the polygon data source'
    },
    {
      name: 'valueField',
      type: 'string',
      required: true,
      description: 'Numeric field to visualize (e.g., area, population)'
    },
    {
      name: 'classification',
      type: 'string',
      required: false,
      defaultValue: 'quantile',
      description: 'Classification method',
      validation: {
        enum: ['quantile', 'equal_interval', 'standard_deviation', 'jenks']
      }
    },
    {
      name: 'numClasses',
      type: 'number',
      required: false,
      defaultValue: 5,
      description: 'Number of classification classes',
      validation: { min: 3, max: 10 }
    },
    {
      name: 'colorRamp',
      type: 'string',
      required: false,
      defaultValue: 'greens',
      description: 'Color ramp scheme (predefined name or comma-separated hex colors)',
      validation: {
        enum: ['greens', 'blues', 'reds', 'oranges', 'purples', 'viridis', 'plasma', 'green_to_red']
      }
    },
    {
      name: 'minZoom',
      type: 'number',
      required: false,
      defaultValue: 0,
      description: 'Minimum zoom level for MVT tiles'
    },
    {
      name: 'maxZoom',
      type: 'number',
      required: false,
      defaultValue: 22,
      description: 'Maximum zoom level for MVT tiles'
    },
    {
      name: 'layerName',
      type: 'string',
      required: false,
      defaultValue: 'choropleth',
      description: 'Name of the MVT layer'
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'MVT service with embedded choropleth style rules in metadata',
    outputFields: [
      {
        name: 'result',
        type: 'string',
        description: 'MVT tile service URL for the choropleth map',
        example: '/api/services/mvt/choropleth_123/{z}/{x}/{y}.pbf'
      },
      {
        name: 'styleUrl',
        type: 'string',
        description: 'Mapbox Style JSON URL with choropleth styling',
        example: '/workspace/results/styles/choropleth_123.json'
      },
      {
        name: 'valueField',
        type: 'string',
        description: 'The field used for thematic coloring',
        example: 'population'
      },
      {
        name: 'classification',
        type: 'string',
        description: 'Classification method used (quantile, equal_interval, etc.)',
        example: 'quantile'
      }
    ]
  },
  capabilities: ['thematic_mapping', 'mvt_publishing', 'statistical_classification'],
  isBuiltin: true,
  installedAt: new Date()
};
