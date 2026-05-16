/**
 * Knowledge answerer - handles RAG-based knowledge query responses
 */

import { LLMAdapterFactory } from '../../adapters/LLMAdapterFactory';
import type { LLMConfig } from '../../adapters/LLMAdapterFactory';
import { TemplateLoader } from './TemplateLoader';
import { FALLBACK_MESSAGES } from './constant';
import { StreamingError } from './errors';
import type { GeoAIStateType } from '../GeoAIGraph';

export class KnowledgeAnswerer {
  private templateLoader: TemplateLoader;
  private llmConfig?: LLMConfig;

  constructor(workspaceBase: string, llmConfig?: LLMConfig) {
    this.templateLoader = new TemplateLoader(workspaceBase);
    this.llmConfig = llmConfig;
  }

  /**
   * Generate answer from knowledge context (RAG)
   */
  async generateKnowledgeAnswer(
    state: GeoAIStateType,
    language: string,
    onToken?: (token: string) => void
  ): Promise<string> {
    if (!this.llmConfig) {
      return FALLBACK_MESSAGES.NO_KB_CONTEXT;
    }
    
    const query = state.userInput;
    const contextString = state.knowledgeContext?.contextString || '';
    
    // Log whether we have KB context
    if (!state.knowledgeContext || !contextString) {
      console.log('[KnowledgeAnswerer] No KB context available, will use general knowledge');
    } else {
      console.log(`[KnowledgeAnswerer] Using KB context (${contextString.length} chars)`);
    }
    
    try {
      // Load knowledge answer template
      const templateStr = await this.templateLoader.loadKnowledgeAnswerTemplate(language);
      
      // Create PromptTemplate from string
      const { PromptTemplate } = await import('@langchain/core/prompts');
      const template = PromptTemplate.fromTemplate(templateStr);
      
      // Use LangChain's format method to fill variables
      const prompt = await template.format({ 
        userQuestion: query,
        knowledgeContext: contextString,
        language: language
      });
      
      const adapter = LLMAdapterFactory.createAdapter(this.llmConfig);
      
      // Use streaming if onToken callback is provided
      if (onToken) {
        console.log('[KnowledgeAnswerer] Streaming knowledge answer...');
        return await this.streamResponse(adapter, prompt, onToken);
      } else {
        // Fallback to non-streaming mode
        const response = await adapter.invoke(prompt);
        const answer = typeof response === 'string' ? response : String(response.content || response);
        
        // Note: Sources are already included by LLM based on prompt template
        // No need to append additional sources here to avoid duplication
        
        return answer;
      }
    } catch (error) {
      console.error('[KnowledgeAnswerer] Knowledge answer failed:', error);
      return FALLBACK_MESSAGES.KB_ANSWER_FAILED;
    }
  }

  /**
   * Stream response with token callback
   */
  private async streamResponse(
    adapter: any,
    prompt: string,
    onToken: (token: string) => void
  ): Promise<string> {
    try {
      const stream = await adapter.stream(prompt);
      
      let fullResponse = '';
      for await (const chunk of stream) {
        // Extract text content from chunk robustly
        const tokenText = this.extractTokenText(chunk);
        
        if (tokenText) {
          fullResponse += tokenText;
          onToken(tokenText);
        }
      }
      
      return fullResponse;
    } catch (error) {
      throw new StreamingError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Extract text content from LLM response chunk
   */
  private extractTokenText(chunk: any): string {
    if (typeof chunk === 'string') {
      return chunk;
    } else if (chunk && typeof chunk === 'object') {
      // Handle AIMessageChunk or similar objects
      if (typeof chunk.content === 'string') {
        return chunk.content;
      } else if (Array.isArray(chunk.content)) {
        // Handle ContentBlock arrays (e.g., [{ type: 'text', text: '...' }])
        return chunk.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('');
      }
    }
    return '';
  }
}
