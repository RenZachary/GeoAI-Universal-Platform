/**
 * Context builder - prepares LLM and template context from workflow state
 */

import type { GeoAIStateType, AnalysisResult, VisualizationService } from '../GeoAIGraph';
import type { TemplateVariables, LLMContext } from './types';
import { SERVICE_TYPE_ICONS, DEFAULT_SERVICE_ICON } from './constant';

export class ContextBuilder {
  /**
   * Prepare template variables from state
   */
  prepareTemplateVariables(state: GeoAIStateType, options: any): TemplateVariables {
    const variables: TemplateVariables = {};

    // Goals summary
    if (options.includeGoals && state.goals) {
      variables.completedGoals = state.goals.length.toString();
      
      // Calculate failed goals from execution results
      let failedGoalsCount = 0;
      if (state.executionResults) {
        const results = Array.from(state.executionResults.values());
        failedGoalsCount = results.filter(r => r.status === 'failed').length;
      }
      variables.failedGoals = failedGoalsCount.toString();
    }

    // Results summary
    if (options.includeResults && state.executionResults) {
      const results = Array.from(state.executionResults.values());
      const successCount = results.filter(r => r.status === 'success').length;
      const failCount = results.filter(r => r.status === 'failed').length;
      
      variables.resultsSummary = this.formatResultsSummary(results, successCount, failCount);
      variables.successCount = successCount.toString();
      variables.failCount = failCount.toString();
      variables.totalCount = results.length.toString();
    }

    // Services summary
    if (options.includeServices && state.visualizationServices) {
      variables.servicesSummary = this.formatServicesList(state.visualizationServices);
      variables.serviceCount = state.visualizationServices.length.toString();
    }

    // Errors
    if (options.includeErrors && state.errors && state.errors.length > 0) {
      variables.errorsSummary = this.formatErrorsList(state.errors);
    }

    return variables;
  }

  /**
   * Prepare context object for LLM prompt
   */
  prepareLLMContext(state: GeoAIStateType): LLMContext {
    const context: LLMContext = {};
    
    // Goals information
    if (state.goals && state.goals.length > 0) {
      context.completedGoals = state.goals.length.toString();
      context.goalsList = state.goals.map(g => `- ${g.description}`).join('\n');
    } else {
      context.completedGoals = '0';
      context.goalsList = 'No goals were processed.';
    }
    
    // Results information
    if (state.executionResults) {
      const results = Array.from(state.executionResults.values());
      const successCount = results.filter(r => r.status === 'success').length;
      const failCount = results.filter(r => r.status === 'failed').length;
      
      // Use template variable names (failedGoals, not failCount)
      context.failedGoals = failCount.toString();
      context.successCount = successCount.toString();
      context.totalCount = results.length.toString();
      
      // Format results summary for template
      context.resultsSummary = this.formatResultsSummary(results, successCount, failCount);
      
      // Add detailed result data (including metadata.summary)
      context.resultDetails = this.formatResultDetails(results);
      
      // Format successful operations
      const successOps = results.filter(r => r.status === 'success');
      context.successfulOperations = successOps.length > 0
        ? successOps.map(r => `- ${r.metadata?.pluginId || 'Unknown'}: Completed successfully`).join('\n')
        : 'None';
      
      // Format failed operations with errors
      const failedOps = results.filter(r => r.status === 'failed');
      context.failedOperations = failedOps.length > 0
        ? failedOps.map(r => `- ${r.metadata?.pluginId || 'Unknown'}: ${r.error}`).join('\n')
        : 'None';
    } else {
      context.failedGoals = '0';
      context.successCount = '0';
      context.totalCount = '0';
      context.resultsSummary = 'No execution results available.';
      context.successfulOperations = 'None';
      context.failedOperations = 'None';
    }
    
    // Services information
    if (state.visualizationServices && state.visualizationServices.length > 0) {
      context.serviceCount = state.visualizationServices.length.toString();
      context.servicesList = state.visualizationServices.map(s => 
        `- ${s.type.toUpperCase()} Service: ${s.url}`
      ).join('\n');
    } else {
      context.serviceCount = '0';
      context.servicesList = 'No visualization services were generated.';
    }
    
    // Errors and warnings
    if (state.errors && state.errors.length > 0) {
      context.errorsList = state.errors.map(e => `- ${e.goalId}: ${e.error}`).join('\n');
    } else {
      context.errorsList = 'No errors occurred.';
    }
    
    return context;
  }

  /**
   * Helper: Format results summary
   */
  private formatResultsSummary(results: AnalysisResult[], successCount: number, failCount: number): string {
    let summary = `Total: ${results.length}, Success: ${successCount}, Failed: ${failCount}\n\n`;
    
    if (successCount > 0) {
      summary += 'Successful:\n';
      results.filter(r => r.status === 'success').forEach(result => {
        const operatorName = result.metadata?.operatorId || 'Unknown';
        summary += `- ${operatorName}\n`;
      });
      summary += '\n';
    }
    
    if (failCount > 0) {
      summary += 'Failed:\n';
      results.filter(r => r.status === 'failed').forEach(result => {
        const operatorName = result.metadata?.operatorId || 'Unknown';
        summary += `- ${operatorName}: ${result.error}\n`;
      });
    }
    
    return summary;
  }

  /**
   * Helper: Format detailed result information - pass raw data to LLM
   */
  private formatResultDetails(results: AnalysisResult[]): string {
    const details: string[] = [];
    
    for (const result of results) {
      if (result.status !== 'success' || !result.data) continue;
      
      const operatorName = result.metadata?.operatorId || 'Unknown';
      
      // Extract actual data from different result structures
      let actualData: any;
      if (result.data.data) {
        // AnalyticalResult structure: { success, data: { type, value, ... }, metadata }
        actualData = result.data.data;
      } else {
        // NativeData structure: { id, type, reference, metadata }
        actualData = result.data;
      }
      
      const resultData = {
        operator: operatorName,
        operation: actualData.operation || result.metadata?.parameters?.operation || 'unknown',
        data: actualData
      };
      
      details.push(JSON.stringify(resultData, null, 2));
    }
    
    return details.length > 0 ? details.join('\n\n') : 'No detailed results available.';
  }

  /**
   * Helper: Format services list
   */
  private formatServicesList(services: VisualizationService[]): string {
    return services.map((service, index) => {
      const icon = this.getServiceTypeIcon(service.type);
      return `${index + 1}. ${icon} ${service.type.toUpperCase()}: ${service.url}`;
    }).join('\n');
  }

  /**
   * Helper: Format errors list
   */
  private formatErrorsList(errors: Array<{ goalId: string; error: string }>): string {
    return errors.map(err => `- ${err.goalId}: ${err.error}`).join('\n');
  }

  /**
   * Helper: Get icon for service type
   */
  private getServiceTypeIcon(type: string): string {
    return SERVICE_TYPE_ICONS[type] || DEFAULT_SERVICE_ICON;
  }
}
