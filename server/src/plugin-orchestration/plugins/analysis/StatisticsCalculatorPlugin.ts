/**
 * Statistics Calculator Plugin
 * Calculates statistical summaries of spatial data attributes
 */

import type { Plugin } from '../../../core';

export const StatisticsCalculatorPlugin: Plugin = {
  id: 'statistics_calculator',
  name: 'Statistics Calculator',
  version: '1.0.0',
  description: 'Calculate statistical summaries (mean, median, std dev, etc.) for data attributes',
  category: 'analysis',
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'data_reference',
      required: true,
      description: 'ID of the data source to analyze'
    },
    {
      name: 'fieldName',
      type: 'string',
      required: true,
      description: 'Name of the field/column to calculate statistics for'
    },
    {
      name: 'statistics',
      type: 'array',
      required: false,
      defaultValue: ['mean', 'median', 'std_dev', 'min', 'max'],
      description: 'List of statistics to calculate',
      validation: {
        enum: ['mean', 'median', 'std_dev', 'variance', 'min', 'max', 'sum', 'count']
      }
    }
  ],
  outputSchema: {
    type: 'statistics',
    description: 'Statistical summary results',
    outputFields: [
      {
        name: 'result',
        type: 'object',
        description: 'Complete statistics object containing all calculated values',
        example: { count: 100, mean: 45.5, median: 42, std_dev: 12.3, min: 10, max: 98 }
      },
      {
        name: 'count',
        type: 'number',
        description: 'Number of valid values',
        example: 100
      },
      {
        name: 'mean',
        type: 'number',
        description: 'Arithmetic mean',
        example: 45.5
      },
      {
        name: 'median',
        type: 'number',
        description: 'Median value',
        example: 42
      },
      {
        name: 'std_dev',
        type: 'number',
        description: 'Standard deviation',
        example: 12.3
      },
      {
        name: 'min',
        type: 'number',
        description: 'Minimum value',
        example: 10
      },
      {
        name: 'max',
        type: 'number',
        description: 'Maximum value',
        example: 98
      }
    ]
  },
  capabilities: ['statistical_analysis', 'attribute_analysis'],
  isBuiltin: true,
  installedAt: new Date()
};
