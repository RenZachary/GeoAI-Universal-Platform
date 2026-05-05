/**
 * MVT Publisher Plugin
 * Generates and publishes Mapbox Vector Tiles from spatial data
 */

import type { Plugin } from '../../../core/index';

export const MVTPublisherPlugin: Plugin = {
  id: 'mvt_publisher',
  name: 'MVT Publisher',
  version: '1.0.0',
  description: 'Generate and publish Mapbox Vector Tiles (MVT) from spatial data',
  category: 'visualization',
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'data_reference',
      required: true,
      description: 'ID of the data source to publish as MVT'
    },
    {
      name: 'minZoom',
      type: 'number',
      required: false,
      defaultValue: 0,
      description: 'Minimum zoom level',
      validation: {
        min: 0,
        max: 22
      }
    },
    {
      name: 'maxZoom',
      type: 'number',
      required: false,
      defaultValue: 22,
      description: 'Maximum zoom level',
      validation: {
        min: 0,
        max: 22
      }
    },
    {
      name: 'layerName',
      type: 'string',
      required: false,
      defaultValue: 'default',
      description: 'Name of the MVT layer'
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'MVT service URL and metadata',
    outputFields: [
      {
        name: 'result',
        type: 'string',
        description: 'MVT tile service URL template',
        example: '/api/services/mvt/tileset_123/{z}/{x}/{y}.pbf'
      },
      {
        name: 'tilesetId',
        type: 'string',
        description: 'Unique identifier for the tileset',
        example: 'tileset_123'
      },
      {
        name: 'serviceUrl',
        type: 'string',
        description: 'Full MVT service URL',
        example: '/api/services/mvt/tileset_123/{z}/{x}/{y}.pbf'
      }
    ]
  },
  capabilities: ['visualization', 'tile_generation'],
  isBuiltin: true,
  installedAt: new Date()
};
