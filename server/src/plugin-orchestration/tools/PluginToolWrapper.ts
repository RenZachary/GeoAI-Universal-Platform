/**
 * Plugin Tool Wrapper - Converts GeoAI-UP plugins to LangChain Tools
 */

import type { DynamicStructuredTool } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { Plugin, ParameterSchema } from '../../core/index.js';
import type { BufferAnalysisParams } from '../executor/analysis/BufferAnalysisExecutor.js';
import { BufferAnalysisExecutor } from '../executor/analysis/BufferAnalysisExecutor.js';
import type { OverlayAnalysisParams } from '../executor/analysis/OverlayAnalysisExecutor.js';
import { OverlayAnalysisExecutor } from '../executor/analysis/OverlayAnalysisExecutor.js';
import type { MVTPublisherParams } from '../executor/visualization/MVTPublisherExecutor.js';
import { MVTPublisherExecutor } from '../executor/visualization/MVTPublisherExecutor.js';
import type { StatisticsCalculatorParams } from '../executor/analysis/StatisticsCalculatorExecutor.js';
import { StatisticsCalculatorExecutor } from '../executor/analysis/StatisticsCalculatorExecutor.js';
import type { FilterParams } from '../executor/analysis/FilterExecutor.js';
import { FilterExecutor } from '../executor/analysis/FilterExecutor.js';
import type { AggregationParams } from '../executor/analysis/AggregationExecutor.js';
import { AggregationExecutor } from '../executor/analysis/AggregationExecutor.js';
import type { ReportGeneratorParams } from '../executor/reporting/ReportGeneratorExecutor.js';
import { ReportGeneratorExecutor } from '../executor/reporting/ReportGeneratorExecutor.js';
import type Database from 'better-sqlite3';

export class PluginToolWrapper {
  private static db: Database.Database;
  private static workspaceBase: string;

  /**
   * Initialize with database connection and workspace base
   */
  static initialize(db: Database.Database, workspaceBase?: string): void {
    this.db = db;
    this.workspaceBase = workspaceBase || process.cwd();
  }

  /**
   * Wrap a Plugin as a LangChain Tool
   */
  static wrapPlugin(plugin: Plugin): DynamicStructuredTool {
    return tool(
      // Tool execution function
      async (input: Record<string, any>) => {
        try {
          console.log(`[Tool Execution] Executing plugin: ${plugin.name}`);

          // Route to appropriate executor based on plugin ID
          let result;

          switch (plugin.id) {
            case 'buffer_analysis':
              {
                const bufferExecutor = new BufferAnalysisExecutor(this.db, this.workspaceBase);
                result = await bufferExecutor.execute(input as BufferAnalysisParams);
                break;
              }

            case 'overlay_analysis':
              {
                const overlayExecutor = new OverlayAnalysisExecutor(this.db, this.workspaceBase);
                result = await overlayExecutor.execute(input as OverlayAnalysisParams);
                break;
              }

            case 'mvt_publisher':
              {
                const mvtExecutor = new MVTPublisherExecutor(this.db, this.workspaceBase);
                result = await mvtExecutor.execute(input as MVTPublisherParams);
                break;
              }

            case 'statistics_calculator':
              {
                const statsExecutor = new StatisticsCalculatorExecutor(this.db, this.workspaceBase);
                result = await statsExecutor.execute(input as StatisticsCalculatorParams);
                break;
              }

            case 'filter':
              {
                const filterExecutor = new FilterExecutor(this.db, this.workspaceBase);
                result = await filterExecutor.execute(input as FilterParams);
                break;
              }

            case 'aggregation':
              {
                const aggregationExecutor = new AggregationExecutor(this.db, this.workspaceBase);
                result = await aggregationExecutor.execute(input as AggregationParams);
                break;
              }

            case 'report_generator':
              {
                const reportExecutor = new ReportGeneratorExecutor(this.db, this.workspaceBase);
                result = await reportExecutor.execute(input as ReportGeneratorParams);
                break;
              }

            default:
              // Fallback: Return mock response for unimplemented plugins
              console.warn(`[Tool Execution] No executor for ${plugin.id}, using mock`);
              result = {
                id: `mock_${Date.now()}`,
                type: 'geojson',
                reference: '',
                metadata: { mock: true, pluginId: plugin.id },
                createdAt: new Date()
              };
          }

          // Return complete NativeData object (not just simplified JSON)
          // This ensures ServicePublisher can access result.data.type correctly
          return JSON.stringify({
            success: true,
            pluginId: plugin.id,
            resultId: result.id,
            type: result.type,  // Include data type for service publishing
            reference: result.reference,
            metadata: result.metadata,
            message: 'Plugin executed successfully'
          });

        } catch (error) {
          console.error(`[Tool Execution] Plugin failed: ${plugin.name}`, error);

          return JSON.stringify({
            success: false,
            pluginId: plugin.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: process.env.NODE_ENV === 'development' && error instanceof Error
              ? error.stack
              : undefined
          });
        }
      },
      {
        // Tool metadata
        name: this.sanitizeName(plugin.name),
        description: this.enrichDescription(plugin),
        schema: this.convertToZodSchema(plugin.inputSchema)
      }
    );
  }

  /**
   * Sanitize plugin name to comply with Tool naming conventions
   * - Only lowercase letters, numbers, underscores
   * - Max length 64 characters
   */
  private static sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .substring(0, 64);
  }

  /**
   * Enrich Tool description with parameter information
   */
  private static enrichDescription(plugin: Plugin): string {
    const inputDesc = Array.isArray(plugin.inputSchema)
      ? plugin.inputSchema
        .map((param: ParameterSchema) =>
          `- ${param.name}: ${param.type}${param.required ? ' (required)' : ' (optional)'}`
        )
        .join('\n')
      : 'No parameters defined';

    return `${plugin.description}\n\nInput Parameters:\n${inputDesc}`;
  }

  /**
   * Convert Plugin parameter schema to Zod schema
   */
  private static convertToZodSchema(params: ParameterSchema[]): z.ZodObject<any> {
    const shape: Record<string, z.ZodType> = {};

    for (const param of params) {
      let zodType: z.ZodType;

      // Create Zod type based on parameter type
      switch (param.type) {
        case 'data_reference':
        case 'string':
          zodType = z.string();
          break;

        case 'number':
          zodType = z.number();
          break;

        case 'boolean':
          zodType = z.boolean();
          break;

        case 'array':
          zodType = z.array(z.any());
          break;

        case 'object':
          zodType = z.record(z.any());
          break;

        default:
          zodType = z.any();
      }

      // Apply validation rules if present
      if (param.validation) {
        zodType = this.applyValidation(zodType, param.validation);
      }

      // Handle optional parameters
      if (!param.required) {
        zodType = zodType.optional();
      }

      // Add description
      if (param.description) {
        zodType = zodType.describe(param.description);
      }

      // Set default value if provided
      if (param.defaultValue !== undefined) {
        zodType = zodType.default(param.defaultValue);
      }

      shape[param.name] = zodType;
    }

    return z.object(shape);
  }

  /**
   * Apply validation rules to Zod type
   */
  private static applyValidation(
    zodType: z.ZodType,
    validation: any
  ): z.ZodType {
    let validated = zodType;

    // Handle enum validation for array elements
    if (validation.enum && Array.isArray(validation.enum) && zodType instanceof z.ZodArray) {
      const enumType = z.enum(validation.enum as [string, ...string[]]);
      validated = z.array(enumType);
    }
    // Handle enum validation for non-array types
    else if (validation.enum && Array.isArray(validation.enum)) {
      validated = z.enum(validation.enum as [string, ...string[]]);
    }

    if (validation.min !== undefined && typeof validation.min === 'number') {
      validated = (validated as any).min(validation.min);
    }

    if (validation.max !== undefined && typeof validation.max === 'number') {
      validated = (validated as any).max(validation.max);
    }

    if (validation.pattern) {
      try {
        validated = (validated as any).regex(new RegExp(validation.pattern));
      } catch (e) {
        console.warn(`Invalid regex pattern: ${validation.pattern}`);
      }
    }

    return validated;
  }
}
