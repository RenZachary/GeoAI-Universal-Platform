/**
 * Prompt Template Manager - Loads and manages prompt templates from files
 */

import { PromptTemplate } from '@langchain/core/prompts';
import fs from 'fs';
import path from 'path';

export class PromptManager {
  private promptsDir: string;
  private templateCache: Map<string, PromptTemplate> = new Map();

  constructor(baseDir: string) {
    this.promptsDir = path.join(baseDir, 'llm/prompts');
  }

  /**
   * Load prompt template
   */
  async loadTemplate(
    templateId: string,
    language: string = 'en-US'
  ): Promise<PromptTemplate> {
    const cacheKey = `${language}/${templateId}`;

    // Check cache
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    const filePath = path.join(this.promptsDir, language, `${templateId}.md`);

    // Fallback to English if requested language not found
    if (!fs.existsSync(filePath)) {
      if (language !== 'en-US') {
        const fallbackPath = path.join(this.promptsDir, 'en-US', `${templateId}.md`);
        if (fs.existsSync(fallbackPath)) {
          return await this.loadFromFile(fallbackPath, templateId, 'en-US');
        }
      }
      throw new Error(`Prompt template not found: ${templateId} (${language})`);
    }

    const template = await this.loadFromFile(filePath, templateId, language);
    this.templateCache.set(cacheKey, template);

    return template;
  }

  /**
   * Load template from file
   */
  private async loadFromFile(
    filePath: string,
    templateId: string,
    language: string
  ): Promise<PromptTemplate> {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Remove HTML comment from first line if present (used for description)
    const cleanedContent = this.removeHtmlComment(content);

    // Extract variables {{variable}}
    const variables = this.extractVariables(cleanedContent);

    // Convert {{variable}} to {variable} for LangChain compatibility
    // LangChain uses Python f-string syntax (single braces), but we use double braces in files for readability
    const langchainCompatible = this.convertToLangChainSyntax(cleanedContent);

    console.log(`Loaded prompt template: ${templateId} (${language}) with variables: [${variables.join(', ')}]`);

    return PromptTemplate.fromTemplate(langchainCompatible);
  }

  /**
   * Extract template variables
   */
  private extractVariables(template: string): string[] {
    const matches = template.match(/\{\{([^}]+)\}\}/g);
    if (!matches) return [];

    return matches.map(match => match.replace(/[{}]/g, ''));
  }

  /**
   * Convert {{variable}} syntax to {variable} for LangChain compatibility
   * Also escapes literal braces in JSON/code blocks as {{ and }}
   */
  private convertToLangChainSyntax(template: string): string {
    // Step 1: First, escape all literal braces that are NOT template variables
    // In LangChain/Python f-strings, literal { must be written as {{ and }} as }}

    // Strategy:
    // 1. Temporarily replace {{variable}} patterns with placeholders
    // 2. Escape all remaining { and } as {{ and }}
    // 3. Restore the variable patterns as {variable}

    const VARIABLE_PLACEHOLDER_PREFIX = '__VAR_';
    const VARIABLE_PLACEHOLDER_SUFFIX = '__';

    // Find all {{variable}} patterns and replace with placeholders
    let varIndex = 0;
    const variableMap = new Map<string, string>();

    const withPlaceholders = template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const placeholder = `${VARIABLE_PLACEHOLDER_PREFIX}${varIndex}${VARIABLE_PLACEHOLDER_SUFFIX}`;
      variableMap.set(placeholder, varName);
      varIndex++;
      return placeholder;
    });

    // Now escape all literal braces
    const escapedBraces = withPlaceholders
      .replace(/\{/g, '{{')
      .replace(/\}/g, '}}');

    // Restore variables as {variableName}
    const final = escapedBraces.replace(
      new RegExp(`${VARIABLE_PLACEHOLDER_PREFIX}(\\d+)${VARIABLE_PLACEHOLDER_SUFFIX}`, 'g'),
      (_, index) => `{${variableMap.get(`${VARIABLE_PLACEHOLDER_PREFIX}${index}${VARIABLE_PLACEHOLDER_SUFFIX}`)!}}`
    );

    // Debug logging
    if (template.includes('{{')) {
      console.log('[PromptManager] Template conversion:', {
        hasVariables: variableMap.size > 0,
        variableCount: variableMap.size,
        originalLength: template.length,
        convertedLength: final.length
      });
    }

    return final;
  }

  /**
   * Remove HTML comment from first line (used for description metadata)
   */
  private removeHtmlComment(content: string): string {
    const lines = content.split('\n');

    // Check if first line is an HTML comment
    if (lines[0].trim().startsWith('<!--') && lines[0].trim().endsWith('-->')) {
      // Remove the first line (HTML comment)
      lines.shift();
      // Return remaining content, trim leading empty lines
      return lines.join('\n').replace(/^\s*\n/, '');
    }

    return content;
  }

  /**
   * Clear cache (for hot update)
   */
  clearCache(templateId?: string): void {
    if (templateId) {
      // Clear specific template for all languages
      for (const key of this.templateCache.keys()) {
        if (key.endsWith(`/${templateId}`)) {
          this.templateCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.templateCache.clear();
    }
  }

  /**
   * List available templates
   */
  async listTemplates(language: string = 'en-US'): Promise<Array<{
    id: string;
    language: string;
    variables: string[];
  }>> {
    const langDir = path.join(this.promptsDir, language);

    if (!fs.existsSync(langDir)) {
      return [];
    }

    const files = fs.readdirSync(langDir);
    const templates = [];

    for (const file of files) {
      if (file.endsWith('.md')) {
        const templateId = file.replace('.md', '');
        const filePath = path.join(langDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const variables = this.extractVariables(content);

        templates.push({
          id: templateId,
          language,
          variables,
        });
      }
    }

    return templates;
  }
}
