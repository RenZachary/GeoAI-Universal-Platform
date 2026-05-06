/**
 * Data Source Query Plugin
 * Provides metadata and listing capabilities for registered data sources
 */

import type { Plugin } from '../../../core/index';

export const DataSourceQueryPlugin: Plugin = {
  id: 'data_source_query',
  name: 'Data Source Query',
  version: '1.0.0',
  description: 'Query and list available data sources with their metadata, types, and characteristics',
  category: 'utility',
  inputSchema: [
    {
      name: 'operation',
      type: 'string',
      required: true,
      description: 'Operation to perform: "list" (list all), "count" (count total), "summary" (brief summary)',
      defaultValue: 'list'
    },
    {
      name: 'filterType',
      type: 'string',
      required: false,
      description: 'Filter by data source type (geojson, shapefile, postgis, geotiff)'
    },
    {
      name: 'searchTerm',
      type: 'string',
      required: false,
      description: 'Search term to filter by name or description'
    },
    {
      name: 'includeDetails',
      type: 'boolean',
      required: false,
      defaultValue: true,
      description: 'Include detailed metadata (fields, geometry type, feature count)'
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'Data source query results as structured data',
    outputFields: [
      {
        name: 'result',
        type: 'object',
        description: 'Query result containing data source information',
        example: {
          operation: 'list',
          totalCount: 8,
          dataSources: [
            {
              id: 'ds_001',
              name: 'Rivers Dataset',
              type: 'postgis',
              geometryType: 'LineString',
              featureCount: 1250
            }
          ]
        }
      },
      {
        name: 'format',
        type: 'string',
        description: 'Output format',
        example: 'json'
      }
    ]
  },
  capabilities: ['metadata_query', 'data_source_listing', 'inventory'],
  isBuiltin: true,
  installedAt: new Date()
};
