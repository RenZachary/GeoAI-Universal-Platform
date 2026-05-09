/**
 * SpatialOperator - Unified abstraction for spatial operations
 * 
 * Replaces the Plugin/Executor/Tool three-layer architecture with a single,
 * type-safe operator pattern using Zod schemas for validation.
 */

import { z } from 'zod';
import type { NativeData } from '../core';

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
 * Operator execution result
 */
export interface OperatorResult {
  success: boolean;
  data?: NativeData;
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
      inputSchema: this.inputSchema.shape,
      outputSchema: this.outputSchema.shape
    };
  }
}
