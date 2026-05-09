/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Summary Generator - Generates analysis summaries using templates
 * Supports multi-language and customizable summary styles
 */

import { PromptManager } from '../managers/PromptManager';
import { LLMAdapterFactory } from '../adapters/LLMAdapterFactory';
import type { LLMConfig } from '../adapters/LLMAdapterFactory';
import type { GeoAIStateType, AnalysisResult, VisualizationService } from './GeoAIGraph';

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
  private llmConfig?: LLMConfig;
  private defaultLanguage: string;

  constructor(workspaceBase: string, defaultLanguage: string = 'en-US', llmConfig?: LLMConfig) {
    this.promptManager = new PromptManager(workspaceBase);
    this.defaultLanguage = defaultLanguage;
    this.llmConfig = llmConfig;
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
      // Try LLM-based generation first (if API keys configured)
      if (this.llmConfig) {
        console.log('[Summary Generator] Using LLM for natural language summary');
        return await this.generateWithLLM(state, language);
      }
      
      // Fallback to template-based generation
      console.log('[Summary Generator] LLM not configured, using template fallback');
      const template = await this.loadSummaryTemplate(language);
      
      if (template) {
        return this.generateFromTemplate(state, template, {
          includeGoals,
          includeResults,
          includeServices,
          includeErrors,
          includeNextSteps
        });
      } else {
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
    
    // Simple template substitution
    // Note: After PromptManager conversion, templates use {variable} syntax (single braces)
    let summary = template;
    
    for (const [key, value] of Object.entries(variables)) {
      // Escape special regex characters in variable name
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match {variable} with single braces (LangChain format after conversion)
      summary = summary.replace(new RegExp(`\\{${escapedKey}\\}`, 'g'), value);
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
   * Generate summary using LLM for natural language output
   */
  private async generateWithLLM(state: GeoAIStateType, language: string): Promise<string> {
    try {
      // Prepare context for LLM
      const context = this.prepareLLMContext(state);
      
      // Load prompt template for summary generation
      const promptTemplate = await this.promptManager.loadTemplate('response-summary', language);
      
      if (!this.llmConfig) {
        console.warn('[Summary Generator] LLM config not found, cannot generate summary');
        return '';
      }
      // Create LLM instance
      const llm = LLMAdapterFactory.createAdapter(this.llmConfig);
      
      // Create chain with prompt and LLM
      const chain = promptTemplate.pipe(llm);
      
      // Invoke LLM with context
      const response = await chain.invoke(context);
      
      // Extract text content from response (handle different response types)
      let summary: string;
      if (typeof response === 'string') {
        summary = response;
      } else if (Array.isArray(response)) {
        // Handle array of content blocks
        summary = response
          .map(block => {
            if (typeof block === 'string') return block;
            if (block && typeof block === 'object' && 'text' in block) return block.text;
            return '';
          })
          .join('');
      } else if (response && typeof response === 'object' && 'content' in response) {
        summary = String(response.content);
      } else {
        summary = String(response);
      }
      
      console.log('[Summary Generator] LLM generated summary successfully');
      return summary;
      
    } catch (error) {
      console.error('[Summary Generator] LLM generation failed, falling back to template:', error);
      throw error; // Will be caught by outer try-catch
    }
  }

  /**
   * Prepare context object for LLM prompt
   */
  private prepareLLMContext(state: GeoAIStateType): Record<string, any> {
    const context: Record<string, any> = {};
    
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
      
      // ← 添加详细的结果数据（包括 metadata.summary）
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
   * Fallback summary generation (when template unavailable)
   */
  private generateFallback(state: GeoAIStateType, options: SummaryOptions): string {
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
      
      // Pass the complete result structure to LLM
      // Let LLM understand and summarize it naturally
      const resultData = {
        operator: operatorName,
        operation: result.metadata?.parameters?.operation || 'unknown',
        data: result.data.metadata?.result || result.data.metadata
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
    switch (type) {
      case 'mvt': return '🗺️';
      case 'image': return '🖼️';
      case 'report': return '📄';
      default: return '📄';
    }
  }
}
