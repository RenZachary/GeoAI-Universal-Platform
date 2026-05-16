/**
 * Fallback renderer - generates fallback summaries when other methods fail
 */

import type { GeoAIStateType, AnalysisResult } from '../GeoAIGraph';
import type { SummaryOptions } from './types';

export class FallbackRenderer {
  /**
   * Generate fallback summary (when template unavailable)
   */
  generateFallback(state: GeoAIStateType, options: SummaryOptions): string {
    let summary = '';
    
    // Header
    summary += '## Analysis Complete\n\n';
        
    // Execution results summary
    if (options.includeResults && state.executionResults) {
      const results = Array.from(state.executionResults.values());
      const successCount = results.filter(r => r.status === 'success').length;
      const failCount = results.filter(r => r.status === 'failed').length;
      
      summary += `### Execution Results\n\n`;
      summary += `- ✅ Successful: ${successCount}\n`;
      summary += `- ❌ Failed: ${failCount}\n`;
      summary += `- 📊 Total: ${results.length}\n\n`;
      
      // List successful operations
      if (successCount > 0) {
        summary += '**Successful Operations:**\n\n';
        results.filter(r => r.status === 'success').forEach(result => {
          const operatorName = result.metadata?.operatorId || 'Unknown';
          summary += `- ✅ ${operatorName}: Completed successfully\n`;
        });
        summary += '\n';
      }
      
      // List failures with details
      if (failCount > 0) {
        summary += '**Failed Operations:**\n\n';
        results.filter(r => r.status === 'failed').forEach(result => {
          const operatorName = result.metadata?.operatorId || 'Unknown';
          summary += `- ❌ ${operatorName}: ${result.error}\n`;
        });
        summary += '\n';
      }
    }
    
    // Errors encountered
    if (options.includeErrors && state.errors && state.errors.length > 0) {
      summary += `### ⚠️ Warnings & Errors\n\n`;
      state.errors.forEach(err => {
        summary += `- **${err.goalId}**: ${err.error}\n`;
      });
      summary += '\n';
    }
    
    return summary;
  }
}
