/**
 * LLM Adapter Factory - Creates LangChain chat models based on configuration
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
// TODO: Install @langchain/ollama to enable Ollama support
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
        // TODO: Install @langchain/ollama package to enable Ollama support
        // npm install @langchain/ollama
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
}
