/**
 * Template renderer - renders summaries from templates
 */

import { TemplateLoader } from './TemplateLoader';
import { ContextBuilder } from './ContextBuilder';
import type { GeoAIStateType } from '../GeoAIGraph';
import type { SummaryOptions } from './types';

export class TemplateRenderer {
  private templateLoader: TemplateLoader;
  private contextBuilder: ContextBuilder;

  constructor(workspaceBase: string) {
    this.templateLoader = new TemplateLoader(workspaceBase);
    this.contextBuilder = new ContextBuilder();
  }

  /**
   * Generate summary from template
   */
  async generateFromTemplate(
    state: GeoAIStateType,
    language: string,
    options: SummaryOptions
  ): Promise<string> {
    try {
      // Load template
      const template = await this.templateLoader.loadSummaryTemplate(language);
      
      // Prepare template variables
      const variables = this.contextBuilder.prepareTemplateVariables(state, options);
      
      // Render template
      return this.templateLoader.renderTemplate(template, variables);
    } catch (error) {
      console.error('[TemplateRenderer] Template rendering failed:', error);
      throw error;
    }
  }
}
