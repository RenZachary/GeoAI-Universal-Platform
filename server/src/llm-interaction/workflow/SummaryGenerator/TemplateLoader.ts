/**
 * Template loader - handles loading and preprocessing of prompt templates
 */

import { PromptManager } from '../../managers/PromptManager';
import { TEMPLATE_NAMES } from './constant';
import { TemplateLoadError } from './errors';
import type { TemplateVariables } from './types';

export class TemplateLoader {
  private promptManager: PromptManager;

  constructor(workspaceBase: string) {
    this.promptManager = new PromptManager(workspaceBase);
  }

  /**
   * Load a template by name and language
   */
  async loadTemplate(templateName: string, language: string): Promise<string> {
    try {
      const template = await this.promptManager.loadTemplate(templateName, language);
      // LangChain's PromptTemplate has a 'template' property with the raw string
      const templateStr = (template as any).template;
      
      if (!templateStr) {
        throw new TemplateLoadError(templateName, language);
      }
      
      return templateStr;
    } catch (error) {
      if (error instanceof TemplateLoadError) {
        throw error;
      }
      throw new TemplateLoadError(templateName, language);
    }
  }

  /**
   * Load summary template
   */
  async loadSummaryTemplate(language: string): Promise<string> {
    return this.loadTemplate(TEMPLATE_NAMES.SUMMARY, language);
  }

  /**
   * Load chat response template
   */
  async loadChatResponseTemplate(language: string): Promise<string> {
    return this.loadTemplate(TEMPLATE_NAMES.CHAT_RESPONSE, language);
  }

  /**
   * Load knowledge answer template
   */
  async loadKnowledgeAnswerTemplate(language: string): Promise<string> {
    return this.loadTemplate(TEMPLATE_NAMES.KNOWLEDGE_ANSWER, language);
  }

  /**
   * Process template conditionals (handle {{#if}} blocks)
   */
  processConditionals(template: string, variables: Record<string, any>): string {
    let processed = template;

    // Handle {{#if variable}}...{{variable}}...{{/if}} blocks
    const ifBlockRegex = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    processed = processed.replace(ifBlockRegex, (match, conditionVar, beforeContent, contentVar, afterContent) => {
      if (variables[conditionVar]) {
        return beforeContent + variables[contentVar] + afterContent;
      } else {
        return '';
      }
    });

    // Handle {{#if variable}}...{{/if}} blocks without inner variable
    const simpleIfRegex = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    processed = processed.replace(simpleIfRegex, (match, conditionVar, content) => {
      if (variables[conditionVar]) {
        return content;
      } else {
        return '';
      }
    });

    return processed;
  }

  /**
   * Render template with variables (simple substitution)
   */
  renderTemplate(template: string, variables: TemplateVariables): string {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
      // Escape special regex characters in variable name
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match {variable} with single braces (LangChain format after conversion)
      result = result.replace(new RegExp(`\\{${escapedKey}\\}`, 'g'), value);
    }
    
    return result;
  }
}
