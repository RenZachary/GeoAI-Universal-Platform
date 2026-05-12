/**
 * LLM Adapter Factory - Creates LangChain chat models and embeddings based on configuration
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
// Note: @langchain/ollama is optional - install with: npm install @langchain/ollama
// import { ChatOllama } from '@langchain/ollama';
import { AIMessage } from '@langchain/core/messages';

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'qwen';
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}

export interface EmbeddingConfig {
  provider: 'openai' | 'qwen'; // Anthropic doesn't provide embeddings; Ollama requires @langchain/community
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  dimensions?: number;
}

export class LLMAdapterFactory {
  /**
   * Create LLM adapter based on configuration
   */
  static createAdapter(config: LLMConfig): BaseChatModel {
    // Check if API key is provided, if not use mock mode for development
    if (!config.apiKey && config.provider !== 'ollama') {
      console.warn('[LLMAdapterFactory] No API key provided, using mock mode for development');
      return this.createMockAdapter();
    }
    
    switch (config.provider) {
      case 'openai':
        return new ChatOpenAI({
          modelName: config.model || 'gpt-4',
          apiKey: config.apiKey,
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens || 2000,
          streaming: config.streaming ?? true,
        });

      case 'anthropic':
        return new ChatAnthropic({
          model: config.model || 'claude-3-opus-20240229',
          apiKey: config.apiKey,
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens || 2000,
          streaming: config.streaming ?? true,
        });

      case 'ollama':
        // Ollama support requires @langchain/ollama package
        // Install with: npm install @langchain/ollama
        throw new Error('Ollama provider requires @langchain/ollama package. Install it first.');
        // return new ChatOllama({
        //   baseUrl: config.baseUrl || 'http://localhost:11434',
        //   model: config.model || 'llama3',
        //   temperature: config.temperature ?? 0.7,
        //   streaming: config.streaming ?? true,
        // });

      case 'qwen':
        // Alibaba Qwen uses OpenAI-compatible API
        return new ChatOpenAI({
          modelName: config.model || 'qwen-plus',
          apiKey: config.apiKey,
          configuration: {
            baseURL: config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          },
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens || 2000,
          streaming: config.streaming ?? true,
        });

      default:
        throw new Error(`Unsupported LLM provider: ${(config as any).provider}`);
    }
  }
  
  /**
   * Create a mock LLM adapter for development without API keys
   * Returns predefined responses based on input patterns
   */
  private static createMockAdapter(): BaseChatModel {
    // Create a simple mock that extends BaseChatModel
    // For now, we'll throw a clear error suggesting to add API key
    // In future, could implement a full mock with pattern matching
    
    const mockModel = {
      _llmType: () => 'mock',
      invoke: async (input: any) => {
        console.warn('[MockLLM] Using mock response - configure OPENAI_API_KEY for real AI features');
        
        // Return a generic response for goal splitting
        if (typeof input === 'string' || (Array.isArray(input) && input[0]?.content)) {
          const userInput = typeof input === 'string' ? input : input[0]?.content || '';
          
          // Mock goal splitting response
          if (userInput.toLowerCase().includes('buffer') || userInput.toLowerCase().includes('分析')) {
            return new AIMessage({
              content: JSON.stringify([
                {
                  id: 'goal_mock_1',
                  description: userInput,
                  type: 'spatial_analysis',
                  priority: 5
                }
              ])
            });
          }
          
          // Default mock response
          return new AIMessage({
            content: 'I understand your request. However, I am running in mock mode because no API key is configured. Please set OPENAI_API_KEY in your .env file for full AI capabilities.'
          });
        }
        
        return new AIMessage({ content: 'Mock response' });
      },
      stream: async function* () {
        yield new AIMessage({ content: 'Mock streaming response' });
      },
      batch: async (inputs: any[]) => {
        return inputs.map(() => new AIMessage({ content: 'Mock batch response' }));
      },
      withStructuredOutput: (schema: any, options?: any) => {
        // Return a wrapper that provides structured output
        return {
          invoke: async (input: any) => {
            console.warn('[MockLLM] Structured output in mock mode');
            
            // For goal splitting, return array of goals
            if (options?.name === 'goal_splitter') {
              return [
                {
                  id: 'goal_mock_1',
                  description: typeof input === 'string' ? input : input.userInput || 'Unknown request',
                  type: 'general',
                  priority: 5
                }
              ];
            }
            
            // For task planning, return execution plan
            if (options?.name === 'task_planner') {
              return {
                goalId: 'goal_mock_1',
                steps: [
                  {
                    stepId: 'step_mock_1',
                    pluginId: 'buffer_analysis',
                    parameters: { distance: 500, unit: 'meters' }
                  }
                ],
                requiredPlugins: ['buffer_analysis']
              };
            }
            
            return {};
          }
        };
      },
      pipe: (other: any) => {
        // Simple pipe implementation for chaining
        return {
          invoke: async (input: any) => {
            const result = await mockModel.invoke(input);
            if (other && other.invoke) {
              return await other.invoke(result);
            }
            return result;
          }
        };
      }
    } as any;
    
    return mockModel;
  }

  /**
   * Test LLM connection
   */
  static async testConnection(config: LLMConfig): Promise<boolean> {
    try {
      const llm = this.createAdapter(config);
      const result = await llm.invoke('Hello');
      return result !== null;
    } catch (error) {
      console.error('LLM connection test failed:', error);
      return false;
    }
  }

  /**
   * Create Embedding adapter based on configuration
   * 
   * Note: Only OpenAI and Qwen/DashScope are supported for embeddings.
   * - Anthropic (Claude) does NOT provide an embeddings API
   * - Ollama requires @langchain/community package (not installed)
   */
  static createEmbeddingAdapter(config: EmbeddingConfig): Embeddings {
    // Check if API key is provided
    if (!config.apiKey) {
      console.warn('[LLMAdapterFactory] No API key provided for embeddings, using mock mode');
      return this.createMockEmbeddingAdapter();
    }
    
    switch (config.provider) {
      case 'openai':
        return new OpenAIEmbeddings({
          modelName: config.model || 'text-embedding-3-small',
          apiKey: config.apiKey,
          dimensions: config.dimensions,
        });

      case 'qwen':
        // Alibaba Qwen/DashScope uses OpenAI-compatible API for embeddings
        return new OpenAIEmbeddings({
          modelName: config.model || 'text-embedding-v2',
          apiKey: config.apiKey,
          configuration: {
            baseURL: config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          },
          dimensions: config.dimensions || 1536,
        });

      default:
        throw new Error(`Unsupported embedding provider: ${(config as any).provider}`);
    }
  }

  /**
   * Create a mock embedding adapter for development
   */
  private static createMockEmbeddingAdapter(): Embeddings {
    // Return a simple mock that generates deterministic fake embeddings
    const mockEmbeddings = {
      embedQuery: async (query: string): Promise<number[]> => {
        console.warn('[MockEmbeddings] Using mock embeddings - configure API key for real embeddings');
        // Generate a deterministic 1536-dimension vector based on query hash
        return this.generateMockEmbedding(query, 1536);
      },
      embedDocuments: async (documents: string[]): Promise<number[][]> => {
        console.warn('[MockEmbeddings] Using mock embeddings for batch');
        return documents.map(doc => this.generateMockEmbedding(doc, 1536));
      },
    } as any;
    
    return mockEmbeddings;
  }

  /**
   * Generate a deterministic mock embedding vector
   */
  private static generateMockEmbedding(text: string, dimensions: number): number[] {
    // Simple hash-based mock embedding (NOT for production!)
    const embedding = new Array(dimensions).fill(0);
    let hash = 0;
    
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Fill embedding with deterministic values based on hash
    for (let i = 0; i < dimensions; i++) {
      embedding[i] = Math.sin(hash + i) * 0.1; // Normalize to small range
    }
    
    return embedding;
  }

  /**
   * Test embedding connection
   */
  static async testEmbeddingConnection(config: EmbeddingConfig): Promise<boolean> {
    try {
      const embeddings = this.createEmbeddingAdapter(config);
      const result = await embeddings.embedQuery('test');
      return Array.isArray(result) && result.length > 0;
    } catch (error) {
      console.error('Embedding connection test failed:', error);
      return false;
    }
  }
}
