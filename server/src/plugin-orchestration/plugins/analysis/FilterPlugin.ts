/**
 * Filter Plugin
 * Filters data based on attribute or spatial conditions
 */

import type { Plugin } from '../../../core';

export const FilterPlugin: Plugin = {
  id: 'filter',
  name: 'Data Filter',
  version: '1.0.0',
  description: 'Filter data sources based on attribute conditions (equals, contains, greater than, etc.) or spatial relationships',
  category: 'analysis',
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'data_reference',
      required: true,
      description: 'ID of the data source to filter'
    },
    {
      name: 'conditions',
      type: 'object',
      required: true,
      description: 'Filter conditions object with field, operator, value, and optional connector'
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'Filtered data as NativeData reference'
  },
  capabilities: ['data_filtering', 'attribute_query', 'spatial_filter'],
  isBuiltin: true,
  installedAt: new Date()
};
