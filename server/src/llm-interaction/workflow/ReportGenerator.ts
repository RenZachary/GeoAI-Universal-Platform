/**
 * Report Generator Service
 * Responsible for generating Markdown reports using LLM based on analysis results.
 * This is a pure logic service, decoupled from the Plugin Executor system.
 */

import { PromptManager } from '../managers/PromptManager';
import { LLMAdapterFactory, type LLMConfig } from '../adapters/LLMAdapterFactory';
import type { AnalysisResult } from './GeoAIGraph';

export interface ReportGenerationParams {
  title: string;
  summary?: string;
  results: AnalysisResult[];
  services?: any[];
  author?: string;
  organization?: string;
}

export class ReportGenerator {
  private promptManager: PromptManager;
  private llmConfig: LLMConfig;

  constructor(workspaceBase: string, llmConfig: LLMConfig) {
    this.promptManager = new PromptManager(workspaceBase);
    this.llmConfig = llmConfig;
  }

  /**
   * Generate a Markdown report based on the provided parameters.
   */
  async generate(params: ReportGenerationParams): Promise<string> {
    console.log('[ReportGenerator] Starting report generation...');
    console.log(`[ReportGenerator] Received ${params.results.length} results`);
    
    if (params.results.length === 0) {
      console.warn('[ReportGenerator] WARNING: No results provided to generate report from!');
      return 'No analysis data was available. The results array is empty or null.';
    }

    try {
      // 1. Load the prompt template
      const promptTemplate = await this.promptManager.loadTemplate('report-generation', 'en-US');
      
      // 2. Prepare context data for the LLM
      // We serialize the results to JSON so the LLM can interpret the raw data
      // Note: We filter out large geometry data to prevent token overflow
      const processedResults = params.results.map(r => ({
        stepId: r.id,
        status: r.status,
        summary: r.data?.metadata?.description || 'No description',
        keyMetrics: r.data?.metadata?.result // Only pass the core result/metrics
      }));

      const context = {
        title: params.title,
        author: params.author || 'GeoAI-UP User',
        organization: params.organization || 'GeoAI-UP',
        summary: params.summary || 'No specific summary provided.',
        results: JSON.stringify(processedResults, null, 2),
        services: JSON.stringify(params.services || [], null, 2)
      };

      console.log('[ReportGenerator] Context prepared:');
      console.log(`  - Title: ${context.title}`);
      console.log(`  - Results length: ${context.results.length} chars`);
      console.log(`  - Services length: ${context.services.length} chars`);

      // 3. Create LLM adapter and chain
      const llm = LLMAdapterFactory.createAdapter(this.llmConfig);
      const chain = promptTemplate.pipe(llm);

      // 4. Invoke LLM
      console.log('[ReportGenerator] Invoking LLM for content synthesis...');
      const response = await chain.invoke(context);
      
      // Ensure we return a string (handle different LangChain output types)
      const content = typeof response === 'string' ? response : (response as any).content || String(response);
      
      console.log(`[ReportGenerator] LLM response type: ${typeof response}`);
      console.log(`[ReportGenerator] Content length: ${content.length} characters`);
      if (content.length < 100) {
        console.log(`[ReportGenerator] Content preview: ${content}`);
      }
      
      console.log('[ReportGenerator] Report content generated successfully.');
      return content;

    } catch (error) {
      console.error('[ReportGenerator] Failed to generate report:', error);
      const wrappedError = new Error(`Report generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }
}
