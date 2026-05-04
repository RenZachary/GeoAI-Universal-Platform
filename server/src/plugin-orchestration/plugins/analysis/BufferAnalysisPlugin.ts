/**
 * Buffer Analysis Plugin
 * Creates buffer zones around spatial features
 */

import type { Plugin } from '../../../core';

export const BufferAnalysisPlugin: Plugin = {
  id: 'buffer_analysis',
  name: 'Buffer Analysis',
  version: '1.0.0',
  description: 'Create buffer zones around spatial features based on specified distance',
  category: 'analysis',
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'data_reference',
      required: true,
      description: 'ID of the input data source to buffer'
    },
    {
      name: 'distance',
      type: 'number',
      required: true,
      defaultValue: 100,
      description: 'Buffer distance',
      validation: {
        min: 0
      }
    },
    {
      name: 'unit',
      type: 'string',
      required: true,
      defaultValue: 'meters',
      description: 'Unit of measurement for buffer distance',
      validation: {
        enum: ['meters', 'kilometers', 'feet', 'miles']
      }
    },
    {
      name: 'dissolve',
      type: 'boolean',
      required: false,
      defaultValue: false,
      description: 'Whether to dissolve overlapping buffers'
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'Buffered geometry as NativeData reference'
  },
  capabilities: ['spatial_analysis', 'geometry_operations'],
  isBuiltin: true,
  installedAt: new Date()
};
