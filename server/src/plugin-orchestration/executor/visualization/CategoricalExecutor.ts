/**
 * Categorical Renderer Executor
 * Colors features based on categorical field values
 * Extends BaseRendererExecutor for unified workflow
 */

import type { NativeData } from '../../../core/index';
import type { DataSourceRecord } from '../../../data-access/repositories';
import { BaseRendererExecutor, type BaseRendererParams } from './BaseRendererExecutor';
import type Database from 'better-sqlite3';

export interface CategoricalParams extends BaseRendererParams {
  categoryField: string;         // Required: categorical field name
  colorScheme?: string;          // Predefined color scheme
  opacity?: number;
}

export class CategoricalExecutor extends BaseRendererExecutor {
  
  constructor(db: Database.Database, workspaceBase?: string) {
    super(db, workspaceBase);
  }
  
  /**
   * Execute categorical rendering
   */
  async execute(params: CategoricalParams): Promise<NativeData> {
    console.log('[CategoricalExecutor] Starting categorical rendering...');
    
    return this.executeBaseWorkflow(params, async (p, nativeData, tilesetId) => {
      // Get unique categories from data
      const accessor = this.accessorFactory.createAccessor(nativeData.type);
      const categories = await accessor.getUniqueValues(nativeData.reference, p.categoryField);
      
      console.log(`[CategoricalExecutor] Found ${categories.length} categories:`, categories);
      
      if (categories.length === 0) {
        throw new Error(`No categories found in field '${p.categoryField}'`);
      }
      
      // Generate categorical style via StyleFactory
      const styleUrl = await this.styleFactory.generateCategoricalStyle({
        tilesetId,
        layerName: p.layerName || 'categorical',
        categoryField: p.categoryField,
        categories,
        colorScheme: p.colorScheme || 'set1',
        opacity: p.opacity || 0.8,
        geometryType: nativeData.metadata?.geometryType
      });
      
      console.log(`[CategoricalExecutor] Style generated: ${styleUrl}`);
      return styleUrl;
    });
  }
  
  /**
   * Validate parameters
   */
  protected validateParams(params: CategoricalParams, dataSource: DataSourceRecord): void {
    // Validate dataSourceId
    if (!params.dataSourceId) {
      throw new Error('dataSourceId is required');
    }
    
    // Validate categoryField exists
    if (!params.categoryField) {
      throw new Error('categoryField is required');
    }
    
    // Check if field exists in metadata
    const fields = dataSource.metadata?.fields;
    if (fields && Array.isArray(fields)) {
      const fieldExists = fields.some((f: any) => {
        const fieldName = typeof f === 'object' ? f.name : f;
        return fieldName === params.categoryField;
      });
      
      if (!fieldExists) {
        const availableFields = fields.map((f: any) => typeof f === 'object' ? f.name : f).join(', ');
        throw new Error(`Category field '${params.categoryField}' not found. Available fields: ${availableFields}`);
      }
    }
    
    // Validate colorScheme if provided
    if (params.colorScheme) {
      const validSchemes = ['set1', 'set2', 'set3', 'pastel1', 'pastel2', 'dark2', 'paired', 'accent'];
      if (!validSchemes.includes(params.colorScheme)) {
        throw new Error(`Invalid color scheme: ${params.colorScheme}. Valid schemes: ${validSchemes.join(', ')}`);
      }
    }
    
    console.log('[CategoricalExecutor] Parameter validation passed');
  }
  
  /**
   * Get renderer-specific metadata
   */
  protected getRendererSpecificMetadata(params: CategoricalParams): any {
    return {
      rendererType: 'categorical',
      categoryField: params.categoryField,
      colorScheme: params.colorScheme || 'set1',
      opacity: params.opacity || 0.8
    };
  }
  
  /**
   * Get renderer type name
   */
  protected getRendererType(): string {
    return 'categorical';
  }
}
