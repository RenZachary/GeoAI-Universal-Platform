/**
 * Heatmap Plugin
 * Generates point density heatmaps using kernel density estimation (KDE)
 */

import type { Plugin } from '../../../core/index';

export const HeatmapPlugin: Plugin = {
  id: 'heatmap_generator',
  name: 'Heatmap Generator',
  version: '1.0.0',
  description: 'Generate point density heatmaps using kernel density estimation for spatial pattern visualization',
  category: 'visualization',
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'data_reference',
      required: true,
      description: 'ID of the point data source to generate heatmap from'
    },
    {
      name: 'radius',
      type: 'number',
      required: false,
      defaultValue: 50,
      description: 'Search radius in meters for kernel density estimation',
      validation: {
        min: 10,
        max: 10000
      }
    },
    {
      name: 'cellSize',
      type: 'number',
      required: false,
      defaultValue: 100,
      description: 'Output raster cell size in meters',
      validation: {
        min: 10,
        max: 1000
      }
    },
    {
      name: 'weightField',
      type: 'string',
      required: false,
      description: 'Optional field name to use as weight for weighted density calculation'
    },
    {
      name: 'colorRamp',
      type: 'string',
      required: false,
      defaultValue: 'hot',
      description: 'Color ramp scheme for heatmap visualization',
      validation: {
        enum: ['hot', 'cool', 'viridis', 'plasma', 'inferno', 'magma']
      }
    },
    {
      name: 'outputFormat',
      type: 'string',
      required: false,
      defaultValue: 'geojson',
      description: 'Output format for heatmap result',
      validation: {
        enum: ['geojson', 'geotiff']
      }
    }
  ],
  outputSchema: {
    type: 'native_data',
    description: 'Generated heatmap as GeoJSON contours with density values',
    outputFields: [
      {
        name: 'result',
        type: 'string',
        description: 'File path to the generated heatmap GeoJSON',
        example: '/workspace/results/geojson/heatmap_123456.geojson'
      },
      {
        name: 'pointCount',
        type: 'number',
        description: 'Number of input points used for heatmap generation',
        example: 1000
      },
      {
        name: 'maxDensity',
        type: 'number',
        description: 'Maximum density value in the heatmap',
        example: 15.5
      }
    ]
  },
  capabilities: ['point_density_analysis', 'kernel_density_estimation', 'spatial_pattern_visualization'],
  isBuiltin: true,
  installedAt: new Date()
};
