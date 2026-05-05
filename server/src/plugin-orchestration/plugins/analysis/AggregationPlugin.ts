/**
 * Aggregation Plugin
 * Performs aggregation operations (MAX, MIN, AVG, SUM, COUNT, TOP_N) on data
 */

import type { Plugin } from '../../../core';

export const AggregationPlugin: Plugin = {
  id: 'aggregation',
  name: 'Data Aggregation',
  version: '1.0.0',
  description: 'Perform aggregation operations on numeric fields: MAX, MIN, AVG, SUM, COUNT, or select TOP N features by value',
  category: 'analysis',
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'data_reference',
      required: true,
      description: 'ID of the data source to aggregate'
    },
    {
      name: 'operation',
      type: 'string',
      required: true,
      description: 'Aggregation operation to perform',
      validation: {
        enum: ['MAX', 'MIN', 'AVG', 'SUM', 'COUNT', 'TOP_N']
      }
    },
    {
      name: 'field',
      type: 'string',
      required: true,
      description: 'Field name to aggregate (not needed for COUNT)'
    },
    {
      name: 'topN',
      type: 'number',
      required: false,
      description: 'Number of top features to return (only for TOP_N operation)',
      validation: {
        min: 1
      }
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'Aggregation result with value and optionally the feature with max/min value',
    outputFields: [
      {
        name: 'result',
        type: 'number',
        description: 'The aggregation result value (count, sum, avg, min, max, or top_n count)',
        example: 10
      },
      {
        name: 'operation',
        type: 'string',
        description: 'The aggregation operation performed',
        example: 'COUNT'
      },
      {
        name: 'field',
        type: 'string',
        description: 'The field that was aggregated (empty for COUNT)',
        example: 'population'
      }
    ]
  },
  capabilities: ['data_aggregation', 'statistical_analysis', 'feature_selection'],
  isBuiltin: true,
  installedAt: new Date()
};
