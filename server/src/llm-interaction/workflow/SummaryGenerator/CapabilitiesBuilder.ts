/**
 * Capabilities builder - generates system capabilities summary for dynamic injection
 */

import { SpatialOperatorRegistryInstance } from '../../../spatial-operators/SpatialOperatorRegistry';

export class CapabilitiesBuilder {
  /**
   * Generate a summary of available system capabilities for dynamic injection
   */
  getCapabilitiesSummary(): string {
    try {
      const operators = SpatialOperatorRegistryInstance.listOperators();
      if (operators.length === 0) return '';

      // Group by category for better structure
      const categories: Record<string, string[]> = {};
      operators.forEach(op => {
        if (!categories[op.category]) categories[op.category] = [];
        categories[op.category].push(`- ${op.name}: ${op.description}`);
      });

      let summary = '';
      Object.entries(categories).forEach(([category, items]) => {
        summary += `\n**${this.capitalize(category)}**: \n${items.join('\n')}\n`;
      });

      return summary.trim();
    } catch (error) {
      console.error('[CapabilitiesBuilder] Failed to generate capabilities summary:', error);
      return '';
    }
  }

  /**
   * Helper to capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
