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
    description: 'Statistical summary results'
  },
  capabilities: ['statistical_analysis', 'attribute_analysis'],
  isBuiltin: true,
  installedAt: new Date()
};
