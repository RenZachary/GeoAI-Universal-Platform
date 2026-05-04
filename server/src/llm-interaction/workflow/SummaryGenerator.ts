/**
 * Summary Generator - Generates analysis summaries using templates
 * Supports multi-language and customizable summary styles
 */

import { PromptManager } from '../managers/PromptManager.js';
import type { GeoAIStateType, AnalysisGoal, AnalysisResult, VisualizationService } from './GeoAIGraph.js';

export interface SummaryOptions {
  language?: string;
  includeGoals?: boolean;
  includeResults?: boolean;
  includeServices?: boolean;
  includeErrors?: boolean;
  includeNextSteps?: boolean;
}

export class SummaryGenerator {
  private promptManager: PromptManager;
  private defaultLanguage: string;

  constructor(workspaceBase: string, defaultLanguage: string = 'en-US') {
    this.promptManager = new PromptManager(workspaceBase);
    this.defaultLanguage = defaultLanguage;
  }

  /**
   * Generate summary from workflow state
   */
  async generate(state: GeoAIStateType, options: SummaryOptions = {}): Promise<string> {
    const {
      language = this.defaultLanguage,
      includeGoals = true,
      includeResults = true,
      includeServices = true,
      includeErrors = true,
      includeNextSteps = true
    } = options;

    try {
      // Try to load summary template
      const template = await this.loadSummaryTemplate(language);
      
      if (template) {
        // Use template-based generation
        return this.generateFromTemplate(state, template, {
          includeGoals,
          includeResults,
          includeServices,
          includeErrors,
          includeNextSteps
        });
      } else {
        // Fallback to hardcoded generation
        console.warn('[Summary Generator] Template not found, using fallback');
        return this.generateFallback(state, {
          includeGoals,
          includeResults,
          includeServices,
          includeErrors,
          includeNextSteps
        });
      }
    } catch (error) {
      console.error('[Summary Generator] Error generating summary:', error);
      return this.generateFallback(state, options);
    }
  }

  /**
   * Load summary template from PromptManager
   */
  private async loadSummaryTemplate(language: string): Promise<string | null> {
    try {
      const template = await this.promptManager.loadTemplate('response-summary', language);
      // LangChain's PromptTemplate has a 'template' property with the raw string
      return (template as any).template || null;
    } catch (error) {
      console.warn('[Summary Generator] Failed to load template:', error);
      return null;
    }
  }

  /**
   * Generate summary from template
   */
  private generateFromTemplate(
    state: GeoAIStateType,
    template: string,
    options: SummaryOptions
  ): string {
    // Prepare template variables
    const variables = this.prepareTemplateVariables(state, options);
    
    // Simple template substitution (can be enhanced with LLM later)
    let summary = template;
    
    for (const [key, value] of Object.entries(variables)) {
      summary = summary.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    
    return summary;
  }

  /**
   * Prepare template variables from state
   */
  private prepareTemplateVariables(state: GeoAIStateType, options: SummaryOptions): Record<string, string> {
    const variables: Record<string, string> = {};

    // Goals summary
    if (options.includeGoals && state.goals) {
      variables.completedGoals = state.goals.length.toString();
      variables.failedGoals = '0'; // Will be calculated from results
      variables.goalsList = this.formatGoalsList(state.goals);
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
   * Fallback summary generation (when template unavailable)
   */
  private generateFallback(state: GeoAIStateType, options: SummaryOptions): string {
    let summary = '';
    
    // Header
    summary += '## Analysis Complete\n\n';
    
    // Goals processed
    if (options.includeGoals && state.goals && state.goals.length > 0) {
      summary += `### Goals Processed (${state.goals.length})\n\n`;
      state.goals.forEach((goal, index) => {
        const goalTypeIcon = this.getGoalTypeIcon(goal.type);
        summary += `${index + 1}. ${goalTypeIcon} **${goal.description}** (${goal.type})\n`;
      });
      summary += '\n';
    }
    
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
          const pluginName = result.metadata?.pluginId || 'Unknown';
          summary += `- ✅ ${pluginName}: Completed successfully\n`;
        });
        summary += '\n';
      }
      
      // List failures with details
      if (failCount > 0) {
        summary += '**Failed Operations:**\n\n';
        results.filter(r => r.status === 'failed').forEach(result => {
          const pluginName = result.metadata?.pluginId || 'Unknown';
          summary += `- ❌ ${pluginName}: ${result.error}\n`;
        });
        summary += '\n';
      }
    }
    
    // Visualization services
    if (options.includeServices && state.visualizationServices && state.visualizationServices.length > 0) {
      summary += `### Generated Services (${state.visualizationServices.length})\n\n`;
      
      state.visualizationServices.forEach((service, index) => {
        const serviceIcon = this.getServiceTypeIcon(service.type);
        summary += `${index + 1}. ${serviceIcon} **${service.type.toUpperCase()} Service**\n`;
        summary += `   - URL: \`${service.url}\`\n`;
        summary += `   - TTL: ${Math.round(service.ttl / 60000)} minutes\n`;
        if (service.metadata?.resultType) {
          summary += `   - Data Type: ${service.metadata.resultType}\n`;
        }
        summary += '\n';
      });
    }
    
    // Errors encountered
    if (options.includeErrors && state.errors && state.errors.length > 0) {
      summary += `### ⚠️ Warnings & Errors\n\n`;
      state.errors.forEach(err => {
        summary += `- **${err.goalId}**: ${err.error}\n`;
      });
      summary += '\n';
    }
    
    // Next steps suggestion
    if (options.includeNextSteps) {
      summary += '---\n\n';
      if (state.visualizationServices && state.visualizationServices.length > 0) {
        summary += '**Next Steps:**\n\n';
        summary += '- View the generated visualization services above\n';
        summary += '- Use the provided URLs to access your data\n';
        summary += '- Services will expire after the TTL period\n';
      } else {
        summary += '*No visualization services were generated. Check the execution results for details.*\n';
      }
    }
    
    return summary;
  }

  /**
   * Helper: Format goals list
   */
  private formatGoalsList(goals: AnalysisGoal[]): string {
    return goals.map((goal, index) => {
      const icon = this.getGoalTypeIcon(goal.type);
      return `${index + 1}. ${icon} ${goal.description} (${goal.type})`;
    }).join('\n');
  }

  /**
   * Helper: Format results summary
   */
  private formatResultsSummary(results: AnalysisResult[], successCount: number, failCount: number): string {
    let summary = `Total: ${results.length}, Success: ${successCount}, Failed: ${failCount}\n\n`;
    
    if (successCount > 0) {
      summary += 'Successful:\n';
      results.filter(r => r.status === 'success').forEach(result => {
        const pluginName = result.metadata?.pluginId || 'Unknown';
        summary += `- ${pluginName}\n`;
      });
      summary += '\n';
    }
    
    if (failCount > 0) {
      summary += 'Failed:\n';
      results.filter(r => r.status === 'failed').forEach(result => {
        const pluginName = result.metadata?.pluginId || 'Unknown';
        summary += `- ${pluginName}: ${result.error}\n`;
      });
    }
    
    return summary;
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
   * Helper: Get icon for goal type
   */
  private getGoalTypeIcon(type: string): string {
    switch (type) {
      case 'spatial_analysis': return '🗺️';
      case 'visualization': return '📊';
      case 'data_processing': return '⚙️';
      default: return '💬';
    }
  }

  /**
   * Helper: Get icon for service type
   */
  private getServiceTypeIcon(type: string): string {
    switch (type) {
      case 'mvt': return '🗺️';
      case 'image': return '🖼️';
      default: return '📄';
    }
  }
}
