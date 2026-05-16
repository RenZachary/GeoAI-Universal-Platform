/**
 * Chat responder - handles general chat query responses
 */

import { LLMAdapterFactory } from '../../adapters/LLMAdapterFactory';
import type { LLMConfig } from '../../adapters/LLMAdapterFactory';
import { TemplateLoader } from './TemplateLoader';
import { FALLBACK_MESSAGES } from './constant';
import { StreamingError } from './errors';

export class ChatResponder {
  private templateLoader: TemplateLoader;
  private llmConfig?: LLMConfig;

  constructor(workspaceBase: string, llmConfig?: LLMConfig) {
    this.templateLoader = new TemplateLoader(workspaceBase);
    this.llmConfig = llmConfig;
  }

  /**
   * Generate response for general chat queries
   */
  async generateChatResponse(
    userInput: string,
    language: string,
    capabilities: string,
    onToken?: (token: string) => void
  ): Promise<string> {
    if (!this.llmConfig) {
      return FALLBACK_MESSAGES.NO_LLM_CONFIG;
    }
    
    try {
      // Load chat response template
      const template = await this.templateLoader.loadChatResponseTemplate(language);
      
      // Process conditionals in template
      const processedTemplate = this.templateLoader.processConditionals(template, {
        availableCapabilities: capabilities
      });
      
      // Use LangChain's format method to fill variables
      const { PromptTemplate } = await import('@langchain/core/prompts');
      const modifiedTemplate = PromptTemplate.fromTemplate(processedTemplate);
      
      const prompt = await modifiedTemplate.format({ 
        userMessage: userInput,
        language: language,
        availableCapabilities: capabilities || ''
      });
      
      const adapter = LLMAdapterFactory.createAdapter(this.llmConfig);
      
      // Use streaming if onToken callback is provided
      if (onToken) {
        console.log('[ChatResponder] Streaming chat response...');
        return await this.streamResponse(adapter, prompt, onToken);
      } else {
        // Fallback to non-streaming mode
        const response = await adapter.invoke(prompt);
        return typeof response === 'string' ? response : String(response.content || response);
      }
    } catch (error) {
      console.error('[ChatResponder] Chat response failed:', error);
      return FALLBACK_MESSAGES.CHAT_FAILED;
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
