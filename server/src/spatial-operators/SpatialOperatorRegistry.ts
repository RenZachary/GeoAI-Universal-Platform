/**
 * SpatialOperatorRegistry - Singleton registry for all spatial operators
 * 
 * Provides centralized registration and discovery of operators,
 * replacing the old Plugin/Executor/Tool registration system.
 */

import { SpatialOperator } from './SpatialOperator';

export class SpatialOperatorRegistry {
  private static instance: SpatialOperatorRegistry;
  private operators: Map<string, SpatialOperator> = new Map();
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  static getInstance(): SpatialOperatorRegistry {
    if (!SpatialOperatorRegistry.instance) {
      SpatialOperatorRegistry.instance = new SpatialOperatorRegistry();
    }
    return SpatialOperatorRegistry.instance;
  }
  
  /**
   * Register a single operator
   */
  register(operator: SpatialOperator): void {
    if (this.operators.has(operator.operatorId)) {
      console.warn(`[SpatialOperatorRegistry] Operator ${operator.operatorId} already registered. Overwriting.`);
    }
    
    this.operators.set(operator.operatorId, operator);
    console.log(`[SpatialOperatorRegistry] Registered operator: ${operator.operatorId} (${operator.name})`);
  }
  
  /**
   * Register multiple operators at once
   */
  registerMany(operators: SpatialOperator[]): void {
    console.log(`[SpatialOperatorRegistry] Registering ${operators.length} operators...`);
    
    for (const operator of operators) {
      this.register(operator);
    }
    
    console.log(`[SpatialOperatorRegistry] Total operators registered: ${this.operators.size}`);
  }
  
  /**
   * Unregister an operator
   */
  unregister(operatorId: string): void {
    if (this.operators.delete(operatorId)) {
      console.log(`[SpatialOperatorRegistry] Unregistered operator: ${operatorId}`);
    } else {
      console.warn(`[SpatialOperatorRegistry] Operator ${operatorId} not found`);
    }
  }
  
  /**
   * Get operator by ID
   */
  getOperator(operatorId: string): SpatialOperator | undefined {
    const operator = this.operators.get(operatorId);
    
    if (!operator) {
      console.warn(`[SpatialOperatorRegistry] Operator not found: ${operatorId}`);
    }
    
    return operator;
  }
  
  /**
   * Check if operator is registered
   */
  hasOperator(operatorId: string): boolean {
    return this.operators.has(operatorId);
  }
  
  /**
   * Get all registered operator IDs
   */
  getOperatorIds(): string[] {
    return Array.from(this.operators.keys());
  }
  
  /**
   * Get operators by category
   */
  getByCategory(category: string): SpatialOperator[] {
    return Array.from(this.operators.values()).filter(
      op => op.category === category
    );
  }
  
  /**
   * Get all operators with metadata (for LLM consumption)
   */
  listOperators(): Array<{
    operatorId: string;
    name: string;
    description: string;
    category: string;
  }> {
    return Array.from(this.operators.values()).map(op => ({
      operatorId: op.operatorId,
      name: op.name,
      description: op.description,
      category: op.category
    }));
  }
  
  /**
   * Get all operators with full metadata including schemas (for LLM task planning)
   */
  listOperatorsWithMetadata(): SpatialOperator[] {
    return Array.from(this.operators.values());
  }
  
  /**
   * Get total number of registered operators
   */
  getOperatorCount(): number {
    return this.operators.size;
  }
  
  /**
   * Clear all registered operators
   */
  clear(): void {
    this.operators.clear();
    console.log('[SpatialOperatorRegistry] Cleared all operators');
  }
}

// Export singleton instance
export const SpatialOperatorRegistryInstance = SpatialOperatorRegistry.getInstance();
