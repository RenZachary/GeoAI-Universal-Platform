/**
 * SpatialOperator - Unified abstraction for spatial operations
 * 
 * Replaces the Plugin/Executor/Tool three-layer architecture with a single,
 * type-safe operator pattern using Zod schemas for validation.
 */

import { z } from 'zod';
import type { NativeData } from '../core';

/**
 * Operator return type classification
 * - 'spatial': Returns NativeData (can be used as dataSourceId in subsequent steps)
 * - 'analytical': Returns statistical/query results (cannot be used as spatial input)
 * - 'textual': Returns text responses (terminal operations)
 */
export type OperatorReturnType = 'spatial' | 'analytical' | 'textual';

/**
 * Operator execution context
 */
export interface OperatorContext {
  db?: any; // Database instance
  workspaceBase?: string;
  userId?: string;
  [key: string]: any;
}

/**
 * Standard output schema for spatial operators (returns NativeData)
 */
export const SpatialOutputSchema = z.object({
  id: z.string().describe('Unique identifier for the result'),
  type: z.string().describe('Data source type (postgis, geojson, shapefile, etc.)'),
  reference: z.string().describe('Reference to the data (table name, file path, etc.)'),
  metadata: z.record(z.any()).optional().describe('Additional metadata including style config, operation details, etc.')
});

/**
 * Standard output schema for analytical operators (returns statistics/queries)
 */
export const AnalyticalOutputSchema = z.object({
  success: z.boolean().default(true),
  data: z.record(z.any()).describe('Analytical result data'),
  metadata: z.object({
    operatorId: z.string(),
    executedAt: z.string(),
    summary: z.string().optional()
  }).optional()
});

/**
 * Operator execution result
 */
export interface OperatorResult {
  success: boolean;
  data?: NativeData | Record<string, any>;
  returnType?: OperatorReturnType;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Abstract base class for all spatial operators
 * 
 * Each operator combines:
 * - Metadata (id, name, description) - from old Plugin
 * - Schema validation (input/output) - new Zod-based approach
 * - Execution logic - from old Executor
 */
export abstract class SpatialOperator {
  /** Unique operator identifier */
  abstract readonly operatorId: string;
  
  /** Human-readable name */
  abstract readonly name: string;
  
  /** Description for LLM understanding */
  abstract readonly description: string;
  
  /** Operator category for grouping */
  abstract readonly category: 'analysis' | 'visualization' | 'query' | 'transformation';
  
  /** Input parameter schema (Zod) */
  abstract readonly inputSchema: z.ZodObject<any>;
  
  /** Output result schema (Zod) */
  abstract readonly outputSchema: z.ZodObject<any>;
  
  /**
   * Return type classification - determines chaining rules
   * - 'spatial': Can be used as dataSourceId in subsequent steps
   * - 'analytical': Cannot be used as spatial input, only for reporting
   * - 'textual': Terminal operation, cannot chain further
   */
  abstract readonly returnType: OperatorReturnType;
  
  /**
   * Validate and execute the operator
   * 
   * This is the main entry point that:
   * 1. Validates input parameters using Zod
   * 2. Executes the core logic
   * 3. Validates output using Zod
   * 4. Returns standardized result
   */
  async execute(
    params: unknown,
    context: OperatorContext = {}
  ): Promise<OperatorResult> {
    try {
      // Step 1: Validate input
      const validatedParams = this.inputSchema.parse(params);
      
      // Step 2: Pre-execution hooks (optional override)
      await this.onBeforeExecute?.(validatedParams, context);
      
      // Step 3: Execute core logic (must be implemented by subclasses)
      const result = await this.executeCore(validatedParams, context);
      
      // Step 4: Post-execution hooks (optional override)
      await this.onAfterExecute?.(result, context);
      
      // Step 5: Validate output
      const validatedOutput = this.outputSchema.parse(result);
      
      return {
        success: true,
        data: validatedOutput as any,
        metadata: {
          operatorId: this.operatorId,
          executedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`[SpatialOperator:${this.operatorId}] Execution failed:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Core execution logic (must be implemented by subclasses)
   */
  protected abstract executeCore(
    params: z.infer<typeof this.inputSchema>,
    context: OperatorContext
  ): Promise<z.infer<typeof this.outputSchema>>;
  
  /**
   * Optional pre-execution hook
   */
  protected onBeforeExecute?(
    params: z.infer<typeof this.inputSchema>,
    context: OperatorContext
  ): Promise<void>;
  
  /**
   * Optional post-execution hook
   */
  protected onAfterExecute?(
    result: z.infer<typeof this.outputSchema>,
    context: OperatorContext
  ): Promise<void>;
  
  /**
   * Get operator metadata as plain object (for LLM consumption)
   */
  getMetadata() {
    return {
      operatorId: this.operatorId,
      name: this.name,
      description: this.description,
      category: this.category,
      returnType: this.returnType,
      inputSchema: this.inputSchema.shape,
      outputSchema: this.outputSchema.shape,
      capabilities: [] as string[], // Can be overridden by subclasses
      version: '1.0.0' // Default version, can be overridden
    };
  }
}
