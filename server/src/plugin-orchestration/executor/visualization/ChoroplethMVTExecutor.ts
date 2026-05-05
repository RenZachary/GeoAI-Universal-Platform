/**
 * Choropleth MVT Executor
 * Generates choropleth thematic maps as MVT services with automatic classification and styling
 * Extends MVTPublisherExecutor to reuse tile generation logic
 */

import fs from 'fs';
import type { NativeData } from '../../../core/index';
import { MVTStrategyPublisher } from '../../../utils/publishers/MVTStrategyPublisher';
import { MVTPublisherExecutor, type MVTPublisherParams } from './MVTPublisherExecutor';
import { StyleFactory } from '../../utils/StyleFactory';


export type ClassificationMethod = 
  | 'quantile'
  | 'equal_interval'
  | 'standard_deviation'
  | 'jenks';

export interface ChoroplethMVTParams extends MVTPublisherParams {
  valueField: string;
  classification?: ClassificationMethod;
  numClasses?: number;
  colorRamp?: string;
}

export class ChoroplethMVTExecutor extends MVTPublisherExecutor {
  
  async execute(params: ChoroplethMVTParams): Promise<NativeData> {
    console.log('[ChoroplethMVTExecutor] Generating themed MVT service...');

    const {
      dataSourceId,
      valueField,
      classification = 'quantile',
      numClasses = 5,
      colorRamp = 'greens',
      minZoom = 0,
      maxZoom = 22,
      layerName = 'choropleth'
    } = params;

    try {
      // Step 1: Load data source using base class helper
      const { dataSource, nativeData, accessor } = await this.loadDataSource(dataSourceId);

      console.log(`[ChoroplethMVTExecutor] Data source type: ${dataSource.type}`);
      console.log(`[ChoroplethMVTExecutor] Value field: ${valueField}`);
      console.log(`[ChoroplethMVTExecutor] Classification: ${classification}, Classes: ${numClasses}`);
      console.log(`[ChoroplethMVTExecutor] Color ramp: ${colorRamp}`);

      // Step 2: Validate field exists and is numeric
      this.validateField(dataSource, valueField);

      // Step 3: Calculate statistics using Accessor's statistical operation
      console.log('[ChoroplethMVTExecutor] Calculating statistics...');
      const stats = await this.calculateStatistics(accessor, dataSource, valueField);
      console.log(`[ChoroplethMVTExecutor] Statistics - Min: ${stats.min}, Max: ${stats.max}, Mean: ${stats.mean.toFixed(2)}`);

      // Step 4: Perform classification using Accessor's statistical operation
      console.log('[ChoroplethMVTExecutor] Performing classification...');
      const breaks = this.classify(accessor, stats.values, classification, numClasses);
      console.log(`[ChoroplethMVTExecutor] Classification breaks: ${breaks.map(b => b.toFixed(2)).join(', ')}`);

      // Step 5: Generate Mapbox GL JS style rules using LLM-provided colorRamp
      const styleRules = this.generateStyleRules(valueField, breaks, colorRamp);
      const legend = this.generateLegend(breaks, colorRamp);

      // Step 6: Generate MVT tiles using base class logic
      console.log('[ChoroplethMVTExecutor] Generating MVT tiles...');
      const mvtPublisher = MVTStrategyPublisher.getInstance(this.workspaceBase);
      const tilesetId = await mvtPublisher.generateTiles(nativeData, {
        minZoom,
        maxZoom,
        layerName
      });

      console.log(`[ChoroplethMVTExecutor] Generated tileset: ${tilesetId}`);

      // Step 7: Generate Mapbox Style JSON using StyleFactory
      
      StyleFactory.initialize();
      
      const styleUrl = StyleFactory.createAndSaveChoroplethStyle({
        tilesetId,
        layerName,
        valueField,
        breaks,
        colors: this.resolveColorRamp(colorRamp, breaks.length),
        minZoom,
        maxZoom,
        opacity: 0.8
      });

      console.log(`[ChoroplethMVTExecutor] Generated style: ${styleUrl}`);

      // Step 8: Return MVT result with style URL in metadata
      return this.createMVTResult(tilesetId, dataSourceId, nativeData.type, {
        minZoom,
        maxZoom,
        layerName,
        // Style URL for frontend rendering
        styleUrl,
        // Thematic mapping metadata
        thematicType: 'choropleth',
        valueField,
        classification,
        numClasses,
        colorRamp,
        breaks,
        styleRules,
        legend,
        statistics: {
          min: stats.min,
          max: stats.max,
          mean: stats.mean,
          count: stats.count
        },
        generationStrategy: nativeData.type === 'geojson' ? 'geojson-vt' : 'pending'
      });

    } catch (error) {
      console.error('[ChoroplethMVTExecutor] Execution failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const wrappedError = new Error(`Choropleth MVT generation failed: ${errorMessage}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }

  /**
   * Validate that the field exists and is numeric
   */
  private validateField(dataSource: any, fieldName: string): void {
    const fieldInfo = dataSource.metadata?.fields?.find(
      (f: any) => f.name === fieldName
    );
    
    if (!fieldInfo) {
      throw new Error(`Field '${fieldName}' not found in data source metadata`);
    }
    
    if (fieldInfo.type !== 'number') {
      throw new Error(`Field '${fieldName}' is not numeric (type: ${fieldInfo.type})`);
    }
  }

  /**
   * Calculate statistics by delegating to Accessor's statistical operation
   */
  private async calculateStatistics(
    accessor: any,
    dataSource: any,
    fieldName: string
  ): Promise<any> {
    // Check if accessor has statistical operation capability
    if (!accessor.statisticalOp) {
      throw new Error(`Statistical operations not supported for data source type: ${dataSource.type}`);
    }

    if (dataSource.type === 'postgis') {
      // PostGIS: use SQL-based statistics calculation
      const tableName = dataSource.reference.split('/').pop();
      return await accessor.statisticalOp.calculateStatistics(tableName, fieldName);
      
    } else if (dataSource.type === 'geojson' || dataSource.type === 'shapefile') {
      // GeoJSON/Shapefile: read file and calculate statistics
      const nativeData = await accessor.read(dataSource.reference);
      const content = fs.readFileSync(nativeData.reference, 'utf-8');
      const geojson = JSON.parse(content);
      
      return accessor.statisticalOp.calculateStatistics(geojson, fieldName);
    }

    throw new Error(`Unsupported data source type for statistics: ${dataSource.type}`);
  }

  /**
   * Classify values by delegating to Accessor's statistical operation
   */
  private classify(
    accessor: any,
    values: number[],
    method: ClassificationMethod,
    numClasses: number
  ): number[] {
    if (!accessor.statisticalOp) {
      throw new Error('Classification not supported by this accessor');
    }

    return accessor.statisticalOp.classify(values, method, numClasses);
  }

  /**
   * Generate Mapbox GL JS paint properties using LLM-provided colorRamp
   */
  private generateStyleRules(fieldName: string, breaks: number[], colorRamp: string): any {
    const colors = this.resolveColorRamp(colorRamp, breaks.length - 1);
    
    const stops: any[] = [];
    for (let i = 0; i < breaks.length - 1; i++) {
      stops.push(breaks[i]);
      stops.push(colors[i]);
    }
    stops.push(breaks[breaks.length - 1]);
    stops.push(colors[colors.length - 1]);
    
    return {
      'fill-color': [
        'interpolate',
        ['linear'],
        ['get', fieldName],
        ...stops
      ],
      'fill-opacity': 0.8,
      'fill-outline-color': '#ffffff'
    };
  }

  /**
   * Resolve colorRamp string to actual color array
   * Supports both predefined ramps and custom hex colors from LLM
   */
  private resolveColorRamp(colorRamp: string, numColors: number): string[] {
    // Predefined color ramps
    const predefinedRamps: Record<string, string[]> = {
      greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32'],
      blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'],
      reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#99000d'],
      oranges: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#8c2d04'],
      purples: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#4a1486'],
      viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
      plasma: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'],
      // Custom gradient from green to red (as per user example)
      green_to_red: ['#00ff00', '#80ff00', '#ffff00', '#ff8000', '#ff0000']
    };

    // Check if it's a predefined ramp
    if (predefinedRamps[colorRamp]) {
      const ramp = predefinedRamps[colorRamp];
      return ramp.slice(0, numColors);
    }

    // Check if it's a comma-separated list of hex colors (custom from LLM)
    if (colorRamp.includes(',')) {
      const colors = colorRamp.split(',').map(c => c.trim());
      if (colors.every(c => /^#[0-9A-Fa-f]{6}$/.test(c))) {
        return colors.slice(0, numColors);
      }
    }

    // Fallback to greens
    console.warn(`Unknown colorRamp: ${colorRamp}, falling back to greens`);
    return predefinedRamps.greens.slice(0, numColors);
  }

  /**
   * Generate legend for the choropleth map
   */
  private generateLegend(breaks: number[], colorRamp: string): Array<{ class: number; range: string; color: string }> {
    const colors = this.resolveColorRamp(colorRamp, breaks.length - 1);
    
    return breaks.slice(0, -1).map((breakVal, i) => ({
      class: i,
      range: `${breakVal.toFixed(2)} - ${breaks[i + 1].toFixed(2)}`,
      color: colors[i]
    }));
  }
}
