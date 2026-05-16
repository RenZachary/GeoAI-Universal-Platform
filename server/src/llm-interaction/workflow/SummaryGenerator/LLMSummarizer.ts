/**
 * LLM summarizer - generates summaries using LLM
 */

import { LLMAdapterFactory } from '../../adapters/LLMAdapterFactory';
import type { LLMConfig } from '../../adapters/LLMAdapterFactory';
import { TemplateLoader } from './TemplateLoader';
import { ContextBuilder } from './ContextBuilder';
import { LLMGenerationError } from './errors';
import type { GeoAIStateType } from '../GeoAIGraph';

export class LLMSummarizer {
  private templateLoader: TemplateLoader;
  private contextBuilder: ContextBuilder;
  private llmConfig: LLMConfig;

  constructor(workspaceBase: string, llmConfig: LLMConfig) {
    this.templateLoader = new TemplateLoader(workspaceBase);
    this.contextBuilder = new ContextBuilder();
    this.llmConfig = llmConfig;
  }

  /**
   * Generate summary using LLM for natural language output
   */
  async generateWithLLM(
    state: GeoAIStateType, 
    language: string,
    onToken?: (token: string) => void
  ): Promise<string> {
    try {
      // Prepare context for LLM
      const context = this.contextBuilder.prepareLLMContext(state);
      
      // Load prompt template for summary generation
      const templateStr = await this.templateLoader.loadSummaryTemplate(language);
      
      // Create PromptTemplate from string
      const { PromptTemplate } = await import('@langchain/core/prompts');
      const promptTemplate = PromptTemplate.fromTemplate(templateStr);
      
      // Create LLM instance
      const llm = LLMAdapterFactory.createAdapter(this.llmConfig);
      
      // Create chain with prompt and LLM
      const chain = promptTemplate.pipe(llm);
      
      // Use streaming for real-time token delivery
      console.log('[LLMSummarizer] Streaming LLM response...');
      const stream = await chain.stream(context);
      
      let summary = '';
      for await (const chunk of stream) {
        // Extract text content from chunk (handle different response types)
        const tokenText = this.extractTokenText(chunk);
        
        summary += tokenText;
        
        // Send token via callback if provided
        if (onToken) {
          onToken(tokenText);
        }
      }
      
      console.log('[LLMSummarizer] LLM generated summary successfully');
      return summary;
      
    } catch (error) {
      console.error('[LLMSummarizer] LLM generation failed:', error);
      throw new LLMGenerationError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Extract text content from LLM response chunk
   */
  private extractTokenText(chunk: any): string {
    if (typeof chunk === 'string') {
      return chunk;
    } else if (chunk && typeof chunk === 'object' && 'content' in chunk) {
      return String(chunk.content);
    } else {
      return String(chunk);
    }
  }
}
