/**
 * Overlay Analysis Plugin
 * Performs spatial overlay operations between datasets
 */

import type { Plugin } from '../../../core';

export const OverlayAnalysisPlugin: Plugin = {
  id: 'overlay_analysis',
  name: 'Overlay Analysis',
  version: '1.0.0',
  description: 'Perform spatial overlay operations between two datasets',
  category: 'analysis',
  inputSchema: [
    {
      name: 'inputDataSourceId',
      type: 'data_reference',
      required: true,
      description: 'Primary input data source'
    },
    {
      name: 'overlayDataSourceId',
      type: 'data_reference',
      required: true,
      description: 'Overlay data source'
    },
    {
      name: 'operation',
      type: 'string',
      required: true,
      defaultValue: 'intersect',
      description: 'Overlay operation type',
      validation: {
        enum: ['intersect', 'union', 'difference', 'symmetric_difference']
      }
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'Result of overlay operation as NativeData reference',
    outputFields: [
      {
        name: 'result',
        type: 'string',
        description: 'File path or URL to the overlay result geometry',
        example: '/workspace/results/geojson/overlay_123456.geojson'
      },
      {
        name: 'featureCount',
        type: 'number',
        description: 'Number of features in the overlay result',
        example: 30
      }
    ]
  },
  capabilities: ['spatial_analysis', 'overlay_operations'],
  isBuiltin: true,
  installedAt: new Date()
};
