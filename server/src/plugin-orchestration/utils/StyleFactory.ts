/**
 * Style Factory - Universal Map Visualization Style Generator
 * 
 * Generates Mapbox GL JS compatible style JSON for various visualization types.
 * This is a reusable utility that can be used by any visualization executor.
 */

import fs from 'fs';
import path from 'path';
import { WorkspaceManagerInstance } from '../../storage';
import { colorEngine } from '../../utils/ColorResolutionEngine';
import { GeometryAdapter, type GeometryType } from '../../utils/GeometryAdapter';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ChoroplethStyleConfig {
  tilesetId: string;
  layerName: string;
  valueField: string;
  breaks: number[];
  colors: string[];
  minZoom?: number;
  maxZoom?: number;
  opacity?: number;
}

export interface HeatmapStyleConfig {
  tilesetId: string;
  layerName: string;
  radius?: number;
  intensity?: number;
  colorStops?: Array<[number, string]>;
  minZoom?: number;
  maxZoom?: number;
}

export interface GraduatedSymbolStyleConfig {
  tilesetId: string;
  layerName: string;
  valueField: string;
  breaks: number[];
  sizes: number[];
  colors?: string[];
  minZoom?: number;
  maxZoom?: number;
}

// New renderer configs for Phase 2
export interface UniformStyleConfig {
  tilesetId: string;
  layerName: string;
  color: string;               // hex, CSS name, Chinese word, or ramp name
  strokeWidth?: number;        // for lines/polygons
  pointSize?: number;          // for points
  opacity?: number;
  geometryType?: string;       // auto-detected from metadata (Point, LineString, Polygon, etc.)
  minZoom?: number;
  maxZoom?: number;
}

export interface CategoricalStyleConfig {
  tilesetId: string;
  layerName: string;
  categoryField: string;
  categories: string[];
  colorScheme?: string;        // set1, set2, etc.
  customColors?: Record<string, string>; // optional custom mapping
  opacity?: number;
  geometryType?: string;
  minZoom?: number;
  maxZoom?: number;
}

export interface ChoroplethStyleConfigNew {
  tilesetId: string;
  layerName: string;
  valueField: string;
  breaks: number[];
  colorRamp: string;           // Changed from 'colors' to 'colorRamp'
  numClasses: number;
  opacity?: number;
  geometryType?: string;
  minZoom?: number;
  maxZoom?: number;
}

export type MapboxStyle = {
  version: number;
  sources: Record<string, any>;
  layers: any[];
  metadata?: Record<string, any>;
};

// ============================================================================
// Style Factory Implementation
// ============================================================================

export class StyleFactory {
  private static stylesDir: string;

  /**
   * Initialize the styles directory
   */
  static initialize(): void {
    this.stylesDir = WorkspaceManagerInstance.getDirectoryPath("RESULTS_STYLE");
    if (!fs.existsSync(this.stylesDir)) {
      fs.mkdirSync(this.stylesDir, { recursive: true });
    }
  }

  /**
   * Generate heatmap style
   */
  static generateHeatmapStyle(config: HeatmapStyleConfig): MapboxStyle {
    const {
      tilesetId,
      layerName,
      radius = 30,
      intensity = 1,
      colorStops = [
        [0, 'rgba(0,0,255,0)'],
        [0.2, 'rgba(0,0,255,1)'],
        [0.4, 'rgba(0,255,0,1)'],
        [0.6, 'rgba(255,255,0,1)'],
        [0.8, 'rgba(255,128,0,1)'],
        [1, 'rgba(255,0,0,1)']
      ],
      minZoom = 0,
      maxZoom = 22
    } = config;

    const style: MapboxStyle = {
      version: 8,
      sources: {
        [tilesetId]: {
          type: 'vector',
          tiles: [`/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`],
          minzoom: minZoom,
          maxzoom: maxZoom
        }
      },
      layers: [
        {
          id: `${layerName}-heatmap`,
          type: 'heatmap',
          source: tilesetId,
          'source-layer': layerName,
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'heatmap-radius': radius,
            'heatmap-intensity': intensity,
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              ...colorStops.flat()
            ] as any
          }
        }
      ],
      metadata: {
        type: 'heatmap',
        radius,
        intensity,
        generatedAt: new Date().toISOString()
      }
    };

    return style;
  }

  /**
   * Generate graduated symbol style
   */
  static generateGraduatedSymbolsStyle(config: GraduatedSymbolStyleConfig): MapboxStyle {
    const {
      tilesetId,
      layerName,
      valueField,
      breaks,
      sizes,
      colors,
      minZoom = 0,
      maxZoom = 22
    } = config;

    // Build size interpolation
    const sizeInterpolate = this.buildInterpolateExpression(valueField, breaks, sizes.map(s => s.toString()));

    // Build color interpolation if colors provided
    const colorInterpolate = colors 
      ? this.buildInterpolateExpression(valueField, breaks, colors)
      : '#409eff';

    const style: MapboxStyle = {
      version: 8,
      sources: {
        [tilesetId]: {
          type: 'vector',
          tiles: [`/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`],
          minzoom: minZoom,
          maxzoom: maxZoom
        }
      },
      layers: [
        {
          id: `${layerName}-circle`,
          type: 'circle',
          source: tilesetId,
          'source-layer': layerName,
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'circle-radius': sizeInterpolate as any,
            'circle-color': typeof colorInterpolate === 'string' ? colorInterpolate : colorInterpolate,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
            'circle-opacity': 0.8
          }
        }
      ],
      metadata: {
        type: 'graduated-symbols',
        valueField,
        breaks,
        sizes,
        colors,
        generatedAt: new Date().toISOString()
      }
    };

    return style;
  }

  /**
   * Save style to file and return the URL path
   */
  static saveStyle(style: MapboxStyle, filename: string): string {
    if (!this.stylesDir) {
      throw new Error('StyleFactory not initialized. Call initialize() first.');
    }

    const filePath = path.join(this.stylesDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(style, null, 2), 'utf-8');
    
    // Return API-accessible URL path
    return `/api/results/styles/${filename}`;
  }

  /**
   * Generate and save heatmap style in one step
   */
  static createAndSaveHeatmapStyle(
    config: HeatmapStyleConfig,
    filename?: string
  ): string {
    const style = this.generateHeatmapStyle(config);
    const defaultFilename = `heatmap_${config.tilesetId}.json`;
    return this.saveStyle(style, filename || defaultFilename);
  }

  // ============================================================================
  // Phase 2: New Renderer Methods
  // ============================================================================

  /**
   * Generate uniform color style
   * @returns URL path to saved style JSON file
   */
  static async generateUniformStyle(config: UniformStyleConfig): Promise<string> {
    const {
      tilesetId,
      layerName,
      color,
      strokeWidth = 2,
      pointSize = 5,
      opacity = 0.8,
      geometryType,
      minZoom = 0,
      maxZoom = 22
    } = config;

    // Resolve color using ColorResolutionEngine
    const resolvedColor = await colorEngine.resolveColor(color);

    // Determine Mapbox layer type based on geometry
    const mapboxLayerType = geometryType 
      ? GeometryAdapter.getMapboxLayerType(geometryType as any)
      : 'fill'; // default to fill

    let layers: any[];

    if (mapboxLayerType === 'circle') {
      // Point geometry - use circle layer
      layers = [{
        id: `${layerName}-points`,
        type: 'circle',
        source: tilesetId,
        'source-layer': 'default',
        minzoom: minZoom,
        maxzoom: maxZoom,
        paint: {
          'circle-radius': pointSize,
          'circle-color': resolvedColor,
          'circle-opacity': opacity,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1
        }
      }];
    } else if (mapboxLayerType === 'line') {
      // Line geometry - use line layer
      layers = [
        {
          id: `${layerName}-line`,
          type: 'line',
          source: tilesetId,
          'source-layer': 'default',
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'line-color': resolvedColor,
            'line-width': strokeWidth,
            'line-opacity': opacity
          }
        }
      ];
    } else {
      // Polygon geometry - use fill layer with outline
      layers = [
        {
          id: `${layerName}-fill`,
          type: 'fill',
          source: tilesetId,
          'source-layer': 'default',
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'fill-color': resolvedColor,
            'fill-opacity': opacity
          }
        },
        {
          id: `${layerName}-outline`,
          type: 'line',
          source: tilesetId,
          'source-layer': 'default',
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'line-color': '#ffffff',
            'line-width': 1,
            'line-opacity': 0.5
          }
        }
      ];
    }

    const style: MapboxStyle = {
      version: 8,
      sources: {
        [tilesetId]: {
          type: 'vector',
          tiles: [`/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`],
          minzoom: minZoom,
          maxzoom: maxZoom
        }
      },
      layers,
      metadata: {
        type: 'uniform',
        color: resolvedColor,
        originalColor: color,
        geometryType,
        generatedAt: new Date().toISOString()
      }
    };

    // Save and return URL
    const filename = `uniform_${tilesetId}.json`;
    return this.saveStyle(style, filename);
  }

  /**
   * Generate categorical style
   * @returns URL path to saved style JSON file
   */
  static async generateCategoricalStyle(config: CategoricalStyleConfig): Promise<string> {
    const {
      tilesetId,
      layerName,
      categoryField,
      categories,
      colorScheme = 'set1',
      customColors,
      opacity = 0.8,
      geometryType,
      minZoom = 0,
      maxZoom = 22
    } = config;

    if (categories.length === 0) {
      throw new Error('Categories array cannot be empty');
    }

    // Resolve colors for each category
    const colors = await colorEngine.resolveColorRamp(colorScheme, categories.length);
    
    // Build color mapping (custom colors override scheme colors)
    const colorMapping: Record<string, string> = {};
    categories.forEach((category, index) => {
      colorMapping[category] = customColors?.[category] || colors[index % colors.length];
    });

    // Determine Mapbox layer type
    const mapboxLayerType = geometryType 
      ? GeometryAdapter.getMapboxLayerType(geometryType as any)
      : 'fill';

    // Build match expression for categorical coloring
    const matchExpr: any[] = ['match', ['get', categoryField]];
    categories.forEach(category => {
      matchExpr.push(category);
      matchExpr.push(colorMapping[category]);
    });
    matchExpr.push('#cccccc'); // default color for unmatched values

    let layers: any[];

    if (mapboxLayerType === 'circle') {
      layers = [{
        id: `${layerName}-points`,
        type: 'circle',
        source: tilesetId,
        'source-layer': 'default',
        minzoom: minZoom,
        maxzoom: maxZoom,
        paint: {
          'circle-radius': 5,
          'circle-color': matchExpr,
          'circle-opacity': opacity,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1
        }
      }];
    } else if (mapboxLayerType === 'line') {
      layers = [{
        id: `${layerName}-line`,
        type: 'line',
        source: tilesetId,
        'source-layer': 'default',
        minzoom: minZoom,
        maxzoom: maxZoom,
        paint: {
          'line-color': matchExpr,
          'line-width': 2,
          'line-opacity': opacity
        }
      }];
    } else {
      layers = [
        {
          id: `${layerName}-fill`,
          type: 'fill',
          source: tilesetId,
          'source-layer': 'default',
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'fill-color': matchExpr,
            'fill-opacity': opacity
          }
        },
        {
          id: `${layerName}-outline`,
          type: 'line',
          source: tilesetId,
          'source-layer': 'default',
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'line-color': '#ffffff',
            'line-width': 1,
            'line-opacity': 0.5
          }
        }
      ];
    }

    // Build legend
    const legend = categories.map((category, index) => ({
      label: category,
      color: colorMapping[category]
    }));

    const style: MapboxStyle = {
      version: 8,
      sources: {
        [tilesetId]: {
          type: 'vector',
          tiles: [`/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`],
          minzoom: minZoom,
          maxzoom: maxZoom
        }
      },
      layers,
      metadata: {
        type: 'categorical',
        categoryField,
        categories,
        colorMapping,
        colorScheme,
        legend,
        geometryType,
        generatedAt: new Date().toISOString()
      }
    };

    // Save and return URL
    const filename = `categorical_${tilesetId}.json`;
    return this.saveStyle(style, filename);
  }

  /**
   * Generate choropleth style (refactored to use colorRamp instead of colors)
   * @returns URL path to saved style JSON file
   */
  static async generateChoroplethStyle(config: ChoroplethStyleConfigNew): Promise<string> {
    const {
      tilesetId,
      layerName,
      valueField,
      breaks,
      colorRamp,
      numClasses,
      opacity = 0.8,
      geometryType,
      minZoom = 0,
      maxZoom = 22
    } = config;

    if (breaks.length < 2) {
      throw new Error('Breaks array must have at least 2 values');
    }

    // Resolve color ramp to actual colors
    const colors = await colorEngine.resolveColorRamp(colorRamp, numClasses);

    // Validate inputs
    if (colors.length !== breaks.length - 1 && colors.length !== breaks.length) {
      throw new Error(`Color count (${colors.length}) must equal breaks length (${breaks.length}) or breaks - 1 (${breaks.length - 1})`);
    }

    // Build interpolate expression
    const interpolateExpr = this.buildInterpolateExpression(valueField, breaks, colors);

    const style: MapboxStyle = {
      version: 8,
      sources: {
        [tilesetId]: {
          type: 'vector',
          tiles: [`/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`],
          minzoom: minZoom,
          maxzoom: maxZoom
        }
      },
      layers: [
        {
          id: `${layerName}-fill`,
          type: 'fill',
          source: tilesetId,
          'source-layer': 'default',
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'fill-color': interpolateExpr,
            'fill-opacity': opacity
          }
        },
        {
          id: `${layerName}-outline`,
          type: 'line',
          source: tilesetId,
          'source-layer': 'default',
          minzoom: minZoom,
          maxzoom: maxZoom,
          paint: {
            'line-color': '#ffffff',
            'line-width': 1,
            'line-opacity': 0.5
          }
        }
      ],
      metadata: {
        type: 'choropleth',
        valueField,
        breaks,
        colorRamp,
        colors,
        numClasses,
        legend: this.buildChoroplethLegend(breaks, colors),
        geometryType,
        generatedAt: new Date().toISOString()
      }
    };

    // Save and return URL
    const filename = `choropleth_${tilesetId}.json`;
    return this.saveStyle(style, filename);
  }

  /**
   * Build legend for choropleth map
   */
  private static buildChoroplethLegend(breaks: number[], colors: string[]): Array<{label: string; color: string}> {
    const legend: Array<{label: string; color: string}> = [];
    
    for (let i = 0; i < breaks.length - 1; i++) {
      const lower = i === 0 ? '' : breaks[i].toFixed(2);
      const upper = breaks[i + 1].toFixed(2);
      const label = i === 0 ? `< ${upper}` : `${lower} - ${upper}`;
      
      legend.push({
        label,
        color: colors[i] || colors[colors.length - 1]
      });
    }
    
    return legend;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Build Mapbox GL JS interpolate expression
   */
  private static buildInterpolateExpression(
    property: string,
    breaks: number[],
    values: string[]
  ): any {
    // Check if all breaks are the same value
    const uniqueBreaks = [...new Set(breaks)];
    if (uniqueBreaks.length === 1) {
      // All values are the same, use a medium color from the ramp for better visibility
      console.warn('[StyleFactory] All break values are identical. Using medium color for visibility.');
      // Use the middle color instead of the first (lightest) one
      const middleIndex = Math.floor(values.length / 2);
      return values[middleIndex];
    }

    const expr: any[] = ['interpolate', ['linear'], ['get', property]];

    // Sort breaks and corresponding values to ensure ascending order
    const sortedIndices = breaks
      .map((val, idx) => ({ val, idx }))
      .sort((a, b) => a.val - b.val)
      .map(item => item.idx);
    
    const sortedBreaks = sortedIndices.map(i => breaks[i]);
    const sortedValues = sortedIndices.map(i => values[i]);

    // If values.length === breaks.length, use breaks[i] -> values[i]
    // If values.length === breaks.length - 1, use ranges between breaks
    if (sortedValues.length === sortedBreaks.length) {
      for (let i = 0; i < sortedBreaks.length; i++) {
        expr.push(sortedBreaks[i]);
        expr.push(sortedValues[i]);
      }
    } else if (sortedValues.length === sortedBreaks.length - 1) {
      for (let i = 0; i < sortedBreaks.length - 1; i++) {
        expr.push(sortedBreaks[i]);
        expr.push(sortedValues[i]);
      }
      // Add the last break with the last color
      expr.push(sortedBreaks[sortedBreaks.length - 1]);
      expr.push(sortedValues[sortedValues.length - 1]);
    } else {
      throw new Error('Invalid breaks/values configuration');
    }

    return expr;
  }
}
