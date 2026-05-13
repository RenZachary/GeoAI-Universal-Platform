/**
 * ToolAdapter - Converts SpatialOperators to LangChain DynamicStructuredTools
 * 
 * This adapter bridges the gap between GeoAI-UP's SpatialOperator architecture
 * and LangChain's tool system for LLM integration.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import type { z } from 'zod';
import type { SpatialOperator } from '../SpatialOperator';

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
          
          // Debug: Log the exact structure of coordinates before passing to operator
          if (input.conditions && input.conditions.geometry && input.conditions.geometry.coordinates) {
            console.log('[ToolAdapter] Coordinates structure BEFORE execute:', {
              type: typeof input.conditions.geometry.coordinates,
              isArray: Array.isArray(input.conditions.geometry.coordinates),
              firstElement: input.conditions.geometry.coordinates[0],
              firstElementType: typeof input.conditions.geometry.coordinates[0],
              isObject: typeof input.conditions.geometry.coordinates[0] === 'object' && !Array.isArray(input.conditions.geometry.coordinates[0])
            });
          }
          
          // Execute the operator with the provided parameters
          console.log(`[ToolAdapter] Operator input:`, input);
          const result = await operator.execute(input);
          
          // Debug: Log the result structure before serialization
          console.log(`[ToolAdapter] Operator result structure:`, {
            success: result.success,
            hasData: 'data' in result,
            dataType: typeof result.data,
            dataKeys: result.data ? Object.keys(result.data) : [],
            dataMetadataKeys: result.data?.metadata ? Object.keys(result.data.metadata) : []
          });
          
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
