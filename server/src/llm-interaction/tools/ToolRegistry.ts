/**
 * Tool Registry - Manages LangChain Tools converted from SpatialOperators
 * 
 * This registry bridges SpatialOperators with LangChain's tool system,
 * enabling LLM agents to discover and execute spatial operations.
 */

import type { DynamicStructuredTool } from '@langchain/core/tools';
import type { SpatialOperator } from '../../spatial-operators/SpatialOperator';
import { SpatialOperatorRegistryInstance } from '../../spatial-operators/SpatialOperatorRegistry';
import { ToolAdapter } from '../../spatial-operators/core/ToolAdapter';

class ToolRegistry {
  private constructor() {}
  private static instance: ToolRegistry;
  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }
  private tools: Map<string, DynamicStructuredTool> = new Map();
  private operatorMap: Map<string, SpatialOperator> = new Map();

  /**
   * Register a SpatialOperator as a LangChain Tool
   */
  async registerOperator(operator: SpatialOperator): Promise<void> {
    try {
      const metadata = operator.getMetadata();
      console.log(`[Tool Registry] Registering operator: ${metadata.operatorId}`);
      
      // Convert operator to LangChain Tool using adapter
      const tool = ToolAdapter.convertToTool(operator);
      
      // Store tool and operator
      this.tools.set(metadata.operatorId, tool);
      this.operatorMap.set(metadata.operatorId, operator);
      
      console.log(`[Tool Registry] Successfully registered: ${tool.name}`);
    } catch (error) {
      console.error(`[Tool Registry] Failed to register operator:`, error);
      throw error;
    }
  }

  /**
   * Register multiple operators
   */
  async registerOperators(operators: SpatialOperator[]): Promise<void> {
    console.log(`[Tool Registry] Registering ${operators.length} operators...`);
    
    for (const operator of operators) {
      await this.registerOperator(operator);
    }
    
    console.log(`[Tool Registry] Total tools registered: ${this.tools.size}`);
  }

  /**
   * Register all operators from SpatialOperatorRegistry
   */
  async registerAllFromRegistry(): Promise<void> {
    // Get all registered operator IDs and fetch them
    const registry = SpatialOperatorRegistryInstance;
    const operatorIds = Array.from((registry as any).operators.keys()) as string[];
    const operators = operatorIds
      .map(id => registry.getOperator(id))
      .filter((op): op is SpatialOperator => op !== undefined);
    
    console.log(`[Tool Registry] Syncing with SpatialOperatorRegistry (${operators.length} operators)...`);
    
    await this.registerOperators(operators);
  }

  /**
   * Unregister an operator/tool
   */
  unregisterOperator(operatorId: string): void {
    if (this.tools.has(operatorId)) {
      const operator = this.operatorMap.get(operatorId);
      this.tools.delete(operatorId);
      this.operatorMap.delete(operatorId);
      console.log(`[Tool Registry] Unregistered: ${operator?.getMetadata().name || operatorId}`);
    } else {
      console.warn(`[Tool Registry] Operator not found: ${operatorId}`);
    }
  }

  /**
   * Get a specific tool by operator ID
   */
  getTool(operatorId: string): DynamicStructuredTool | undefined {
    return this.tools.get(operatorId);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): DynamicStructuredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get operator information by ID
   */
  getOperator(operatorId: string): SpatialOperator | undefined {
    return this.operatorMap.get(operatorId);
  }

  /**
   * Get all registered operators
   */
  getAllOperators(): SpatialOperator[] {
    return Array.from(this.operatorMap.values());
  }

  /**
   * Check if an operator is registered
   */
  hasOperator(operatorId: string): boolean {
    return this.tools.has(operatorId);
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
    this.operatorMap.clear();
    console.log('[Tool Registry] Cleared all tools');
  }

  /**
   * List tools with metadata (for API response)
   */
  listToolsWithMetadata() {
    const result = [];
    
    for (const [operatorId, tool] of this.tools.entries()) {
      const operator = this.operatorMap.get(operatorId);
      const metadata = operator?.getMetadata();
      
      result.push({
        id: operatorId,
        name: tool.name,
        description: tool.description,
        category: metadata?.category,
        version: '1.0.0', // SpatialOperators don't have version field
        isBuiltin: true, // All built-in operators
        parameters: metadata?.inputSchema,
        outputSchema: metadata?.outputSchema
      });
    }
    
    return result;
  }
}
export const ToolRegistryInstance = ToolRegistry.getInstance();
