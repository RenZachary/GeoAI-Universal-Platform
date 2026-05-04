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

    // Extract variables {{variable}}
    const variables = this.extractVariables(content);

    console.log(`Loaded prompt template: ${templateId} (${language}) with variables: [${variables.join(', ')}]`);

    return PromptTemplate.fromTemplate(content);
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
