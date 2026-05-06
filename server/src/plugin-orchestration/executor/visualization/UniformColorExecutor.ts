/**
 * Uniform Color Renderer Executor
 * Renders all features with a single uniform color
 * Extends BaseRendererExecutor for unified workflow
 */

import type { NativeData } from '../../../core/index';
import type { DataSourceRecord } from '../../../data-access/repositories';
import { BaseRendererExecutor, type BaseRendererParams } from './BaseRendererExecutor';
import type Database from 'better-sqlite3';

export interface UniformColorParams extends BaseRendererParams {
  color?: string;              // hex, color name, or ramp name
  strokeWidth?: number;        // for lines/polygons (0.5-20)
  pointSize?: number;          // for points (1-50)
}

export class UniformColorExecutor extends BaseRendererExecutor {
  
  constructor(db: Database.Database, workspaceBase?: string) {
    super(db, workspaceBase);
  }
  
  /**
   * Execute uniform color rendering
   */
  async execute(params: UniformColorParams): Promise<NativeData> {
    console.log('[UniformColorExecutor] Starting uniform color rendering...');
    
    return this.executeBaseWorkflow(params, async (p, nativeData, tilesetId) => {
      // Generate uniform style via StyleFactory
      const styleUrl = await this.styleFactory.generateUniformStyle({
        tilesetId,
        layerName: p.layerName || 'uniform',
        color: p.color || '#409eff',
        strokeWidth: p.strokeWidth,
        pointSize: p.pointSize,
        opacity: p.opacity || 0.8,
        geometryType: nativeData.metadata?.geometryType
      });
      
      console.log(`[UniformColorExecutor] Style generated: ${styleUrl}`);
      return styleUrl;
    });
  }
  
  /**
   * Validate parameters
   */
  protected validateParams(params: UniformColorParams, dataSource: DataSourceRecord): void {
    // Validate dataSourceId exists
    if (!params.dataSourceId) {
      throw new Error('dataSourceId is required');
    }
    
    // Validate color format (if provided) - basic validation, detailed validation in ColorResolutionEngine
    if (params.color && typeof params.color !== 'string') {
      throw new Error('color must be a string');
    }
    
    // Validate numeric ranges
    if (params.strokeWidth !== undefined && (params.strokeWidth < 0.5 || params.strokeWidth > 20)) {
      throw new Error('strokeWidth must be between 0.5 and 20');
    }
    
    if (params.pointSize !== undefined && (params.pointSize < 1 || params.pointSize > 50)) {
      throw new Error('pointSize must be between 1 and 50');
    }
    
    if (params.opacity !== undefined && (params.opacity < 0 || params.opacity > 1)) {
      throw new Error('opacity must be between 0 and 1');
    }
    
    console.log('[UniformColorExecutor] Parameter validation passed');
  }
  
  /**
   * Get renderer-specific metadata
   */
  protected getRendererSpecificMetadata(params: UniformColorParams): any {
    return {
      rendererType: 'uniform',
      color: params.color || '#409eff',
      strokeWidth: params.strokeWidth || 2,
      pointSize: params.pointSize || 5,
      opacity: params.opacity || 0.8
    };
  }
  
  /**
   * Get renderer type name
   */
  protected getRendererType(): string {
    return 'uniform_color';
  }
}
