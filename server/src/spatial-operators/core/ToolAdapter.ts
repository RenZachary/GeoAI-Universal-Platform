/**
 * ToolAdapter - Converts SpatialOperators to LangChain DynamicStructuredTools
 * 
 * This adapter bridges the gap between GeoAI-UP's SpatialOperator architecture
 * and LangChain's tool system for LLM integration.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { SpatialOperator } from '../core/SpatialOperator';

export class ToolAdapter {
  /**
   * Convert a SpatialOperator to a LangChain DynamicStructuredTool
   */
  static convertToTool(operator: SpatialOperator): DynamicStructuredTool {
    const metadata = operator.getMetadata();
    
    // Build Zod schema from operator's input schema
    const zodSchema = this.buildZodSchemaFromZodObject(operator.inputSchema);
    
    // Create the tool
    return new DynamicStructuredTool({
      name: metadata.operatorId,
      description: metadata.description,
      schema: zodSchema,
      func: async (input: Record<string, any>) => {
        try {
          console.log(`[ToolAdapter] Executing operator: ${metadata.operatorId}`);
          
          // Execute the operator with the provided parameters
          const result = await operator.execute(input);
          
          // Return serialized result
          return JSON.stringify(result, null, 2);
        } catch (error) {
          console.error(`[ToolAdapter] Failed to execute operator ${metadata.operatorId}:`, error);
          throw error;
        }
      }
    });
  }

  /**
   * Build Zod schema from operator's Zod object directly
   */
  private static buildZodSchemaFromZodObject(zodObject: any): z.ZodObject<any> {
    // The operator already has a Zod schema, just return it
    return zodObject;
  }

  /**
   * Convert multiple operators to tools
   */
  static convertManyToTools(operators: SpatialOperator[]): DynamicStructuredTool[] {
    return operators.map(operator => this.convertToTool(operator));
  }
}
