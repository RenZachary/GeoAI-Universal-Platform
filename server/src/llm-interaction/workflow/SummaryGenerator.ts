/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Summary Generator - Generates analysis summaries using templates
 * Supports multi-language and customizable summary styles
 */

import { PromptManager } from '../managers/PromptManager';
import { LLMAdapterFactory } from '../adapters/LLMAdapterFactory';
import type { LLMConfig } from '../adapters/LLMAdapterFactory';
import type { GeoAIStateType, AnalysisResult, VisualizationService } from './GeoAIGraph';
import { SpatialOperatorRegistryInstance } from '../../spatial-operators/SpatialOperatorRegistry';

export interface SummaryOptions {
  language?: string;
  includeGoals?: boolean;
  includeResults?: boolean;
  includeServices?: boolean;
  includeErrors?: boolean;
  includeNextSteps?: boolean;
  onToken?: (token: string) => void; // Callback for real-time token streaming
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
   * Adapts behavior based on intent type (GIS_ANALYSIS, KNOWLEDGE_QUERY, HYBRID, GENERAL_CHAT)
   */
  async generate(state: GeoAIStateType, options: SummaryOptions = {}): Promise<string> {
    const {
      language = this.defaultLanguage,
      includeGoals = true,
      includeResults = true,
      includeServices = true,
      includeErrors = true,
      includeNextSteps = true,
      onToken
    } = options;

    try {
      // NEW: Adapt summary generation based on intent type
      if (state.intent?.type === 'GENERAL_CHAT') {
        console.log('[Summary Generator] Generating chat response');
        return await this.generateChatResponse(state.userInput, language, onToken);
      }
      
      if (state.intent?.type === 'KNOWLEDGE_QUERY' && state.knowledgeContext) {
        console.log('[Summary Generator] Generating knowledge-based answer');
        return await this.generateKnowledgeAnswer(state, language, onToken);
      }
      
      // Default: GIS analysis or hybrid summary
      console.log('[Summary Generator] Generating GIS analysis summary');
      
      // Try LLM-based generation first (if API keys configured)
      if (this.llmConfig) {
        console.log('[Summary Generator] Using LLM for natural language summary');
        return await this.generateWithLLM(state, language, onToken);
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
   * Generate response for general chat queries
   */
  private async generateChatResponse(
    userInput: string,
    language: string,
    onToken?: (token: string) => void
  ): Promise<string> {
    if (!this.llmConfig) {
      return 'I understand your message. How can I help you with spatial analysis or knowledge queries?';
    }
    
    try {
      // Load chat response template
      const template = await this.promptManager.loadTemplate('chat-response', language);
      
      // Dynamic Capability Injection - preprocess template string before formatting
      let templateStr = (template as any).template || '';
      if (!templateStr) {
        console.warn('[Summary Generator] chat-response template not found, using fallback');
        return 'Hello! How can I assist you today?';
      }
      
      const capabilities = this.getCapabilitiesSummary();
      
      // Handle {{#if}} blocks in the raw template string
      if (capabilities) {
        const ifBlockRegex = /\{\{#if availableCapabilities\}\}[\s\S]*?\{\{availableCapabilities\}\}[\s\S]*?\{\{\/if\}\}/g;
        templateStr = templateStr.replace(ifBlockRegex, `\n## Currently Available Capabilities\nThe following capabilities are currently active in the system:\n{{availableCapabilities}}`);
      } else {
        const ifBlockRegex = /\{\{#if availableCapabilities\}\}[\s\S]*?\{\{\/if\}\}/g;
        templateStr = templateStr.replace(ifBlockRegex, '');
      }
      
      // Create a new PromptTemplate with the modified string
      const { PromptTemplate } = await import('@langchain/core/prompts');
      const modifiedTemplate = PromptTemplate.fromTemplate(templateStr);
      
      // Use LangChain's format method to fill variables
      const prompt = await modifiedTemplate.format({ 
        userMessage: userInput,
        language: language,
        availableCapabilities: capabilities || ''
      });
      
      const adapter = LLMAdapterFactory.createAdapter(this.llmConfig);
      
      // Use streaming if onToken callback is provided
      if (onToken) {
        console.log('[Summary Generator] Streaming chat response...');
        const stream = await adapter.stream(prompt);
        
        let fullResponse = '';
        for await (const chunk of stream) {
          // Extract text content from chunk robustly
          let tokenText: string = '';
          
          if (typeof chunk === 'string') {
            tokenText = chunk;
          } else if (chunk && typeof chunk === 'object') {
            // Handle AIMessageChunk or similar objects
            if (typeof chunk.content === 'string') {
              tokenText = chunk.content;
            } else if (Array.isArray(chunk.content)) {
              // Handle ContentBlock arrays (e.g., [{ type: 'text', text: '...' }])
              tokenText = chunk.content
                .filter((block: any) => block.type === 'text')
                .map((block: any) => block.text)
                .join('');
            }
          }
          
          if (tokenText) {
            fullResponse += tokenText;
            onToken(tokenText);
          }
        }
        
        return fullResponse;
      } else {
        // Fallback to non-streaming mode
        const response = await adapter.invoke(prompt);
        return typeof response === 'string' ? response : String(response.content || response);
      }
    } catch (error) {
      console.error('[Summary Generator] Chat response failed:', error);
      return 'I understand. How can I assist you today?';
    }
  }
  
  /**
   * Generate answer from knowledge context (RAG)
   */
  private async generateKnowledgeAnswer(
    state: GeoAIStateType,
    language: string,
    onToken?: (token: string) => void
  ): Promise<string> {
    if (!this.llmConfig || !state.knowledgeContext) {
      return 'I could not find relevant information in the knowledge base.';
    }
    
    const { query, contextString } = state.knowledgeContext;
    
    try {
      // Load knowledge answer template
      const template = await this.promptManager.loadTemplate('knowledge-answer', language);
      
      // Use LangChain's format method to fill variables
      const prompt = await template.format({ 
        userQuestion: query,
        knowledgeContext: contextString,
        language: language
      });
      
      const adapter = LLMAdapterFactory.createAdapter(this.llmConfig);
      
      // Use streaming if onToken callback is provided
      if (onToken) {
        console.log('[Summary Generator] Streaming knowledge answer...');
        const stream = await adapter.stream(prompt);
        
        let fullResponse = '';
        for await (const chunk of stream) {
          // Extract text content from chunk robustly
          let tokenText: string = '';
          
          if (typeof chunk === 'string') {
            tokenText = chunk;
          } else if (chunk && typeof chunk === 'object') {
            // Handle AIMessageChunk or similar objects
            if (typeof chunk.content === 'string') {
              tokenText = chunk.content;
            } else if (Array.isArray(chunk.content)) {
              // Handle ContentBlock arrays (e.g., [{ type: 'text', text: '...' }])
              tokenText = chunk.content
                .filter((block: any) => block.type === 'text')
                .map((block: any) => block.text)
                .join('');
            }
          }
          
          if (tokenText) {
            fullResponse += tokenText;
            onToken(tokenText);
          }
        }
        
        const answer = fullResponse;
        
        // Note: Sources are already included by LLM based on prompt template
        // No need to append additional sources here to avoid duplication
        
        return answer;
      } else {
        // Fallback to non-streaming mode
        const response = await adapter.invoke(prompt);
        const answer = typeof response === 'string' ? response : String(response.content || response);
        
        // Note: Sources are already included by LLM based on prompt template
        // No need to append additional sources here to avoid duplication
        
        return answer;
      }
    } catch (error) {
      console.error('[Summary Generator] Knowledge answer failed:', error);
      return 'I found some relevant documents but encountered an error generating the answer.';
    }
  }
  
  /**
   * Generate a summary of available system capabilities for dynamic injection
   */
  private getCapabilitiesSummary(): string {
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
      console.error('[Summary Generator] Failed to generate capabilities summary:', error);
      return '';
    }
  }

  /**
   * Helper to capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
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
  private async generateWithLLM(
    state: GeoAIStateType, 
    language: string,
    onToken?: (token: string) => void
  ): Promise<string> {
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
      
      // Use streaming for real-time token delivery
      console.log('[Summary Generator] Streaming LLM response...');
      const stream = await chain.stream(context);
      
      let summary = '';
      for await (const chunk of stream) {
        // Extract text content from chunk (handle different response types)
        let tokenText: string;
        if (typeof chunk === 'string') {
          tokenText = chunk;
        } else if (chunk && typeof chunk === 'object' && 'content' in chunk) {
          tokenText = String(chunk.content);
        } else {
          tokenText = String(chunk);
        }
        
        summary += tokenText;
        
        // Send token via callback if provided
        if (onToken) {
          onToken(tokenText);
        }
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
