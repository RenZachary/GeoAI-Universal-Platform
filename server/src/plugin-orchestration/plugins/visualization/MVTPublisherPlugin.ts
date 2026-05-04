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
      defaultValue: 14,
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
    description: 'MVT service URL and metadata'
  },
  capabilities: ['visualization', 'tile_generation'],
  isBuiltin: true,
  installedAt: new Date()
};
