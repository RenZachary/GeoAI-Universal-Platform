/**
 * Style Factory - Universal Map Visualization Style Generator
 * 
 * Generates Mapbox GL JS compatible style JSON for various visualization types.
 * This is a reusable utility that can be used by any visualization executor.
 */

import fs from 'fs';
import path from 'path';
import { WorkspaceManagerInstance } from '../../storage';

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
   * Generate choropleth (thematic) map style
   */
  static generateChoroplethStyle(config: ChoroplethStyleConfig): MapboxStyle {
    const {
      tilesetId,
      layerName,
      valueField,
      breaks,
      colors,
      minZoom = 0,
      maxZoom = 22,
      opacity = 0.8
    } = config;

    // Validate inputs
    if (breaks.length !== colors.length && breaks.length !== colors.length + 1) {
      throw new Error('Breaks and colors length mismatch. Colors should be either equal to breaks or breaks - 1');
    }

    // Build interpolate expression for fill-color
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
          // Use 'default' as source-layer to match geojson-vt configuration
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
          // Use 'default' as source-layer to match geojson-vt configuration
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
        colors,
        generatedAt: new Date().toISOString()
      }
    };

    return style;
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
   * Generate and save choropleth style in one step
   */
  static createAndSaveChoroplethStyle(
    config: ChoroplethStyleConfig,
    filename?: string
  ): string {
    const style = this.generateChoroplethStyle(config);
    const defaultFilename = `choropleth_${config.tilesetId}.json`;
    return this.saveStyle(style, filename || defaultFilename);
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
