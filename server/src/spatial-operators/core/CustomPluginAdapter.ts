/**
 * Custom Plugin Adapter - Wraps JavaScript plugins as SpatialOperators
 * 
 * This adapter allows users to write custom plugins in plain JavaScript
 * (no TypeScript, no compilation required) while integrating seamlessly
 * with the v2.0 SpatialOperator architecture.
 * 
 * Plugin Structure:
 *   workspace/plugins/custom/my-plugin/
 *   ├── plugin.json (metadata + JSON Schema)
 *   └── index.js (export async function execute(params, context))
 */

import { z } from 'zod';
import { SpatialOperator, type OperatorContext } from '../SpatialOperator';
import type { PluginManifest } from '../plugins/CustomPluginLoader';
import { wrapError } from '../../core';
import { pathToFileURL } from 'url';

/**
 * Convert JSON Schema to Zod schema
 */
function jsonSchemaToZod(schema: any): z.ZodType<any> {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  switch (schema.type) {
    case 'string':
      return z.string();
    case 'number':
      return schema.default !== undefined 
        ? z.number().default(schema.default)
        : z.number();
    case 'boolean':
      return schema.default !== undefined
        ? z.boolean().default(schema.default)
        : z.boolean();
    case 'array':
      return z.array(z.any());
    case 'object':
      if (schema.properties) {
        const shape: Record<string, z.ZodType<any>> = {};
        for (const [key, value] of Object.entries(schema.properties)) {
          shape[key] = jsonSchemaToZod(value);
        }
        const zodObj = z.object(shape);
        return schema.required && Array.isArray(schema.required)
          ? zodObj.partial().extend(
              schema.required.reduce((acc: any, key: string) => {
                acc[key] = shape[key];
                return acc;
              }, {})
            )
          : zodObj;
      }
      return z.record(z.any());
    default:
      return z.any();
  }
}

/**
 * Adapter that wraps a JavaScript plugin as a SpatialOperator
 */
export class CustomPluginAdapter extends SpatialOperator {
  readonly operatorId: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'analysis' | 'visualization' | 'query' | 'transformation';
  readonly inputSchema: z.ZodObject<any>;
  readonly outputSchema: z.ZodObject<any> = z.object({}); // Placeholder
  
  private manifest: PluginManifest;
  private executeFunction: any = null;
  private workspaceBase: string;
  private db?: any;

  constructor(
    manifest: PluginManifest,
    modulePath: string,
    workspaceBase: string,
    db?: any
  ) {
    super();
    this.manifest = manifest;
    this.workspaceBase = workspaceBase;
    this.db = db;
    
    // Map plugin metadata to operator properties
    this.operatorId = manifest.id;
    this.name = manifest.name;
    this.description = manifest.description;
    this.category = this.mapCategory(manifest.category);
    
    // Build Zod schema from plugin's inputSchema (JSON Schema format)
    this.inputSchema = jsonSchemaToZod(manifest.inputSchema) as z.ZodObject<any>;
    
    // Load the execute function from the module (async, but we don't await in constructor)
    // The execute() method will check if it's loaded before calling
    void this.loadExecuteFunction(modulePath);
  }

  /**
   * Map plugin category to operator category
   */
  private mapCategory(pluginCategory: string): 'analysis' | 'visualization' | 'query' | 'transformation' {
    switch (pluginCategory) {
      case 'analysis':
        return 'analysis';
      case 'visualization':
        return 'visualization';
      case 'data_import':
        return 'transformation';
      case 'utility':
        return 'transformation';
      default:
        return 'analysis';
    }
  }

  /**
   * Dynamically load the execute function from the plugin module
   */
  private async loadExecuteFunction(modulePath: string): Promise<void> {
    try {
      console.log(`[CustomPluginAdapter] Loading plugin module: ${modulePath}`);
      
      // Use dynamic import with file:// URL for ES modules
      const moduleUrl = pathToFileURL(modulePath).href;
      const module = await import(moduleUrl);
      
      if (typeof module.execute !== 'function') {
        throw new Error(`Plugin module must export an 'execute' function. Found: ${Object.keys(module).join(', ')}`);
      }
      
      this.executeFunction = module.execute;
      console.log(`[CustomPluginAdapter] Successfully loaded execute function from ${this.operatorId}`);
    } catch (error) {
      console.error(`[CustomPluginAdapter] Failed to load plugin ${this.operatorId}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw wrapError(error, `Failed to load plugin ${this.operatorId}: ${message}`);
    }
  }

  /**
   * Execute the custom plugin (implements abstract method)
   */
  protected async executeCore(input: any, context: OperatorContext): Promise<any> {
    if (!this.executeFunction) {
      throw new Error(`Plugin ${this.operatorId} not loaded properly. Check that index.js exports an 'execute' function.`);
    }

    try {
      console.log(`[CustomPluginAdapter] Executing plugin: ${this.operatorId}`);
      console.log(`[CustomPluginAdapter] Input:`, JSON.stringify(input, null, 2));

      // Prepare execution context
      const pluginContext = {
        db: this.db || context?.db,
        workspaceBase: this.workspaceBase || context?.workspaceBase,
        ...context
      };

      // Call the plugin's execute function
      const result = await this.executeFunction(input, pluginContext);

      console.log(`[CustomPluginAdapter] Plugin ${this.operatorId} executed successfully`);
      
      return result;
    } catch (error) {
      console.error(`[CustomPluginAdapter] Plugin ${this.operatorId} execution failed:`, error);
      throw error;
    }
  }

  /**
   * Get operator metadata for LLM understanding
   */
  getMetadata() {
    return {
      operatorId: this.operatorId,
      name: this.name,
      description: this.description,
      category: this.category,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      capabilities: this.manifest.capabilities || [],
      version: this.manifest.version,
      isCustom: true
    };
  }
}
