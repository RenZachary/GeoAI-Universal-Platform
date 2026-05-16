/**
 * Summary Generator - Generates analysis summaries using templates
 * Supports multi-language and customizable summary styles
 * 
 * Architecture:
 * - Service layer (this file): Orchestrates summary generation flow
 * - ChatResponder: Handles general chat response generation
 * - KnowledgeAnswerer: Handles RAG-based knowledge answers
 * - LLMSummarizer: Handles LLM-based summary generation
 * - TemplateRenderer: Handles template-based summary rendering
 * - FallbackRenderer: Handles fallback summary generation
 * - ContextBuilder: Prepares LLM and template context
 * - TemplateLoader: Loads and processes prompt templates
 * - CapabilitiesBuilder: Generates system capabilities summary
 */

import type { GeoAIStateType } from '../GeoAIGraph';
import type { LLMConfig } from '../../adapters/LLMAdapterFactory';
import type { SummaryOptions } from './types';
import { DEFAULT_LANGUAGE } from './constant';
import { ChatResponder } from './ChatResponder';
import { KnowledgeAnswerer } from './KnowledgeAnswerer';
import { LLMSummarizer } from './LLMSummarizer';
import { TemplateRenderer } from './TemplateRenderer';
import { FallbackRenderer } from './FallbackRenderer';
import { CapabilitiesBuilder } from './CapabilitiesBuilder';

export class SummaryGenerator {
  private chatResponder: ChatResponder;
  private knowledgeAnswerer: KnowledgeAnswerer;
  private llmSummarizer?: LLMSummarizer;
  private templateRenderer: TemplateRenderer;
  private fallbackRenderer: FallbackRenderer;
  private capabilitiesBuilder: CapabilitiesBuilder;
  private defaultLanguage: string;

  constructor(workspaceBase: string, defaultLanguage: string = DEFAULT_LANGUAGE, llmConfig?: LLMConfig) {
    this.defaultLanguage = defaultLanguage;
    
    // Initialize component instances
    this.chatResponder = new ChatResponder(workspaceBase, llmConfig);
    this.knowledgeAnswerer = new KnowledgeAnswerer(workspaceBase, llmConfig);
    this.templateRenderer = new TemplateRenderer(workspaceBase);
    this.fallbackRenderer = new FallbackRenderer();
    this.capabilitiesBuilder = new CapabilitiesBuilder();
    
    // Initialize LLM summarizer only if config is provided
    if (llmConfig) {
      this.llmSummarizer = new LLMSummarizer(workspaceBase, llmConfig);
    }
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
        const capabilities = this.capabilitiesBuilder.getCapabilitiesSummary();
        return await this.chatResponder.generateChatResponse(
          state.userInput,
          language,
          capabilities,
          onToken
        );
      }
      
      if (state.intent?.type === 'KNOWLEDGE_QUERY' && state.knowledgeContext) {
        console.log('[Summary Generator] Generating knowledge-based answer');
        return await this.knowledgeAnswerer.generateKnowledgeAnswer(state, language, onToken);
      }
      
      // Default: GIS analysis or hybrid summary
      console.log('[Summary Generator] Generating GIS analysis summary');
      
      // Try LLM-based generation first (if API keys configured)
      if (this.llmSummarizer) {
        console.log('[Summary Generator] Using LLM for natural language summary');
        return await this.llmSummarizer.generateWithLLM(state, language, onToken);
      }
      
      // Fallback to template-based generation
      console.log('[Summary Generator] LLM not configured, using template fallback');
      const templateRenderer = this.templateRenderer;
      const fallbackRenderer = this.fallbackRenderer;
      
      try {
        return await templateRenderer.generateFromTemplate(state, language, {
          includeGoals,
          includeResults,
          includeServices,
          includeErrors,
          includeNextSteps
        });
      } catch (error) {
        console.warn('[Summary Generator] Template rendering failed, using fallback:', error);
        return fallbackRenderer.generateFallback(state, {
          includeGoals,
          includeResults,
          includeServices,
          includeErrors,
          includeNextSteps
        });
      }
    } catch (error) {
      console.error('[Summary Generator] Error generating summary:', error);
      return this.fallbackRenderer.generateFallback(state, options);
    }
  }
}

// Singleton instance
export const SummaryGeneratorInstance = (workspaceBase: string, defaultLanguage?: string, llmConfig?: LLMConfig) => 
  new SummaryGenerator(workspaceBase, defaultLanguage, llmConfig);