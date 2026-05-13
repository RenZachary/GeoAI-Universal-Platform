/**
 * Intent Classifier Node for LangGraph Workflow
 * 
 * Classifies user queries into intent types to enable conditional routing:
 * - GIS_ANALYSIS: Pure spatial operations
 * - KNOWLEDGE_QUERY: Pure knowledge/document questions
 * - HYBRID: Combines spatial analysis with knowledge context
 * - GENERAL_CHAT: Greetings, small talk
 * 
 * Uses rule-based pre-filtering for fast path, LLM fallback for ambiguous cases.
 */

import type { GeoAIStateType } from '../GeoAIGraph';
import type { IntentClassification, IntentType } from '../../../knowledge-base/types';
import { INTENT_CONFIG } from '../../../knowledge-base/config';
import { LLMAdapterFactory } from '../../adapters/LLMAdapterFactory';
import type { LLMConfig } from '../../adapters/LLMAdapterFactory';
import { PromptManager } from '../../managers/PromptManager';
import { wrapError } from '../../../core';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export class IntentClassifierNode {
  private llmAdapter: BaseChatModel;
  private promptManager: PromptManager;
  private language: string;
  
  constructor(llmConfig: LLMConfig, workspaceBase: string, language: string = 'en-US') {
    this.llmAdapter = LLMAdapterFactory.createAdapter(llmConfig);
    this.promptManager = new PromptManager(workspaceBase);
    this.language = language;
  }
  
  /**
   * Classify user input intent using LLM
   */
  async classify(state: GeoAIStateType): Promise<Partial<GeoAIStateType>> {
    const userInput = state.userInput;
    console.log('[IntentClassifier] Classifying intent for:', userInput.substring(0, 100));
    
    try {
      // Use LLM for robust semantic classification
      const llmResult = await this.llmBasedClassification(userInput, state);
      
      console.log(`[IntentClassifier] LLM classification: ${llmResult.type} (confidence: ${llmResult.confidence})`);
      
      return {
        intent: llmResult,
        currentStep: 'intent_classification'
      };
    } catch (error) {
      console.error('[IntentClassifier] Classification failed:', error);
      // Fallback to GIS_ANALYSIS to maintain workflow continuity
      return {
        intent: {
          type: 'GIS_ANALYSIS',
          confidence: 0.5,
          reasoning: 'Classification failed, defaulting to GIS_ANALYSIS'
        },
        currentStep: 'intent_classification'
      };
    }
  }
    
  /**
   * Extract and parse JSON from LLM response, handling markdown code blocks
   */
  private extractJsonFromResponse(content: string): any {
    try {
      // First, try parsing as-is (in case it's already clean JSON)
      return JSON.parse(content);
    } catch (e) {
      // If that fails, try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch (innerError) {
          console.warn('[IntentClassifier] Failed to parse extracted JSON block', innerError);
        }
      }
      
      // Fallback: find the first { and last }
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          const jsonStr = content.substring(firstBrace, lastBrace + 1);
          return JSON.parse(jsonStr);
        } catch (finalError) {
          console.warn('[IntentClassifier] Failed to parse JSON from braces extraction', finalError);
        }
      }      
      
      throw wrapError(e, `Could not extract valid JSON from LLM response`);
    }
  }

  /**
   * LLM-based classification for complex/ambiguous queries
   */
  private async llmBasedClassification(input: string, state: GeoAIStateType): Promise<IntentClassification> {
    try {
      const template = await this.promptManager.loadTemplate('intent-classification', this.language);
      
      // Pass spatial context summary to template
      const ctx = (state as any).context;
      const spatialContext = ctx ? JSON.stringify(ctx) : '';
      
      const prompt = await template.format({ userQuery: input, spatialContext });
      // console.log('[IntentClassifier] Prompt:', prompt);
      const response = await this.llmAdapter.invoke(prompt);
      // console.log('[IntentClassifier] LLM Response:', response);
      const content = typeof response === 'string' ? response : String(response.content || response);
      
      const parsed = this.extractJsonFromResponse(content);
      return {
        type: parsed.type as IntentType,
        confidence: parseFloat(parsed.confidence) || 0.7,
        reasoning: parsed.reasoning || 'LLM classification'
      };
    } catch (error) {
      console.error('[IntentClassifier] LLM classification failed:', error);
      return {
        type: 'GIS_ANALYSIS',
        confidence: 0.5,
        reasoning: 'LLM classification failed, fallback to GIS_ANALYSIS'
      };
    }
  }
}

// Singleton instance factory
let intentClassifierInstance: IntentClassifierNode | null = null;

export function getIntentClassifier(
  llmConfig: LLMConfig, 
  workspaceBase: string,
  language: string = 'en-US'
): IntentClassifierNode {
  if (!intentClassifierInstance) {
    intentClassifierInstance = new IntentClassifierNode(llmConfig, workspaceBase, language);
  }
  return intentClassifierInstance;
}
