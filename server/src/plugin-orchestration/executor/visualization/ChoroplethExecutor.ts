/**
 * Choropleth Renderer Executor
 * Creates graduated color maps based on numeric field values
 * Extends BaseRendererExecutor for unified workflow
 */

import type { NativeData } from '../../../core/index';
import type { DataSourceRecord } from '../../../data-access/repositories';
import { BaseRendererExecutor, type BaseRendererParams } from './BaseRendererExecutor';
import type Database from 'better-sqlite3';

export type ClassificationMethod = 
  | 'quantile'
  | 'equal_interval'
  | 'standard_deviation'
  | 'jenks';

export interface ChoroplethParams extends BaseRendererParams {
  valueField: string;
  classification?: ClassificationMethod;
  numClasses?: number;
  colorRamp?: string;
}

export class ChoroplethExecutor extends BaseRendererExecutor {
  
  constructor(db: Database.Database, workspaceBase?: string) {
    super(db, workspaceBase);
  }
  
  /**
   * Execute choropleth rendering
   */
  async execute(params: ChoroplethParams): Promise<NativeData> {
    console.log('[ChoroplethExecutor] Starting choropleth rendering...');
    
    return this.executeBaseWorkflow(params, async (p, nativeData, tilesetId) => {
      // Calculate statistics using accessor
      const accessor = this.accessorFactory.createAccessor(nativeData.type);
      
      // Check if accessor has statisticalOp
      if (!(accessor as any).statisticalOp) {
        throw new Error(`Data accessor for ${nativeData.type} does not support statistical operations`);
      }
      
      const stats = await (accessor as any).statisticalOp.calculateStatistics(
        nativeData.reference, 
        p.valueField
      );
      
      console.log(`[ChoroplethExecutor] Statistics calculated:`, stats);
      
      // Classify data
      const breaks = await (accessor as any).statisticalOp.classify(
        stats.values,
        p.classification || 'quantile',
        p.numClasses || 5
      );
      
      console.log(`[ChoroplethExecutor] Classification breaks:`, breaks);
      
      // Generate choropleth style via StyleFactory
      const styleUrl = await this.styleFactory.generateChoroplethStyle({
        tilesetId,
        layerName: p.layerName || 'choropleth',
        valueField: p.valueField,
        breaks,
        colorRamp: p.colorRamp || 'greens',
        numClasses: breaks.length - 1,
        opacity: p.opacity || 0.8,
        geometryType: nativeData.metadata?.geometryType
      });
      
      console.log(`[ChoroplethExecutor] Style generated: ${styleUrl}`);
      return styleUrl;
    });
  }
  
  /**
   * Validate parameters
   */
  protected validateParams(params: ChoroplethParams, dataSource: DataSourceRecord): void {
    // Validate dataSourceId
    if (!params.dataSourceId) {
      throw new Error('dataSourceId is required');
    }
    
    // Validate valueField exists
    if (!params.valueField) {
      throw new Error('valueField is required');
    }
    
    // Check if field exists in metadata
    const fields = dataSource.metadata?.fields;
    if (fields && Array.isArray(fields)) {
      const fieldExists = fields.some((f: any) => {
        const fieldName = typeof f === 'object' ? f.name : f;
        return fieldName === params.valueField;
      });
      
      if (!fieldExists) {
        const availableFields = fields.map((f: any) => typeof f === 'object' ? f.name : f).join(', ');
        throw new Error(`Value field '${params.valueField}' not found. Available fields: ${availableFields}`);
      }
    }
    
    // Validate classification method
    if (params.classification) {
      const validMethods: ClassificationMethod[] = ['quantile', 'equal_interval', 'standard_deviation', 'jenks'];
      if (!validMethods.includes(params.classification)) {
        throw new Error(`Invalid classification method: ${params.classification}. Valid methods: ${validMethods.join(', ')}`);
      }
    }
    
    // Validate numClasses
    if (params.numClasses !== undefined && (params.numClasses < 3 || params.numClasses > 9)) {
      throw new Error('numClasses must be between 3 and 9');
    }
    
    console.log('[ChoroplethExecutor] Parameter validation passed');
  }
  
  /**
   * Get renderer-specific metadata
   */
  protected getRendererSpecificMetadata(params: ChoroplethParams): any {
    return {
      rendererType: 'choropleth',
      valueField: params.valueField,
      classification: params.classification || 'quantile',
      numClasses: params.numClasses || 5,
      colorRamp: params.colorRamp || 'greens',
      opacity: params.opacity || 0.8
    };
  }
  
  /**
   * Get renderer type name
   */
  protected getRendererType(): string {
    return 'choropleth';
  }
}
