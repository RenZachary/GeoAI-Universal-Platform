/**
 * Report Generator Plugin
 * Generates comprehensive analysis reports in HTML/PDF format
 */

import type { Plugin } from '../../../core/index';

export const ReportGeneratorPlugin: Plugin = {
  id: 'report_generator',
  name: 'Report Generator',
  version: '1.0.0',
  description: 'Generate comprehensive analysis reports with charts, maps, and statistics',
  category: 'report',
  inputSchema: [
    {
      name: 'title',
      type: 'string',
      required: true,
      description: 'Report title'
    },
    {
      name: 'analysisResults',
      type: 'array',
      required: true,
      description: 'Array of analysis results to include in report'
    },
    {
      name: 'visualizationServices',
      type: 'array',
      required: false,
      description: 'Visualization services to embed in report'
    },
    {
      name: 'summary',
      type: 'string',
      required: false,
      description: 'Analysis summary text'
    },
    {
      name: 'format',
      type: 'string',
      required: false,
      defaultValue: 'html',
      description: 'Output format (html or pdf)'
    },
    {
      name: 'includeCharts',
      type: 'boolean',
      required: false,
      defaultValue: true,
      description: 'Include statistical charts in report'
    },
    {
      name: 'includeMaps',
      type: 'boolean',
      required: false,
      defaultValue: true,
      description: 'Include map visualizations in report'
    },
    {
      name: 'author',
      type: 'string',
      required: false,
      description: 'Report author name'
    },
    {
      name: 'organization',
      type: 'string',
      required: false,
      description: 'Organization name'
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'Generated report file path and metadata',
    outputFields: [
      {
        name: 'result',
        type: 'string',
        description: 'File path to the generated report',
        example: '/workspace/results/reports/report_123456.html'
      },
      {
        name: 'format',
        type: 'string',
        description: 'Report format (html or pdf)',
        example: 'html'
      },
      {
        name: 'filePath',
        type: 'string',
        description: 'Absolute file path of the report',
        example: 'E:\\codes\\GeoAI-UP\\workspace\\results\\reports\\report_123456.html'
      }
    ]
  },
  capabilities: ['reporting', 'html_generation', 'pdf_generation', 'chart_embedding'],
  isBuiltin: true,
  installedAt: new Date()
};
