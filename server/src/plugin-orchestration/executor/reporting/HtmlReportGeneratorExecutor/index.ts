/**
 * Report Generator Plugin Executor
 * Generates comprehensive analysis reports in HTML format
 */

import type { NativeData } from '../../../../core/index';
import type Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateHTMLReport } from './impl/HTMLReportGenerator';
import { prepareReportFile, writeReportFile } from './impl/ReportFileOperations';
import { createReportMetadata } from './impl/ReportMetadata';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ReportGeneratorParams {
  title: string;
  analysisResults: Array<{
    type: string;
    data: any;
    description?: string;
  }>;
  visualizationServices?: Array<{
    type: string;
    layerId?: string;
    name?: string;
    source?: string;
  }>;
  summary?: string;
  format?: 'html' | 'pdf';
  includeCharts?: boolean;
  includeMaps?: boolean;
  author?: string;
  organization?: string;
}

export class HtmlReportGeneratorExecutor {
  private workspaceBase: string;

  constructor(workspaceBase?: string) {
    this.workspaceBase = workspaceBase || path.join(__dirname, '..', '..', '..', '..', 'workspace');
  }

  async execute(params: ReportGeneratorParams): Promise<NativeData> {
    console.log('[ReportGeneratorExecutor] Generating report...');
    console.log('[ReportGeneratorExecutor] Params:', {
      title: params.title,
      format: params.format,
      resultsCount: params.analysisResults?.length,
      servicesCount: params.visualizationServices?.length
    });

    try {
      // Step 1: Prepare report file paths and ID
      const { reportId, reportPath, reportFilename, publicUrl } = prepareReportFile({
        workspaceBase: this.workspaceBase
      });

      // Step 2: Generate HTML content using the modular HTML generator
      const htmlContent = generateHTMLReport({
        title: params.title,
        summary: params.summary,
        author: params.author,
        organization: params.organization,
        analysisResults: params.analysisResults,
        visualizationServices: params.visualizationServices,
        reportId
      });

      // Step 3: Write report to file using the modular file operations
      writeReportFile(reportPath, htmlContent);
      console.log(`[ReportGeneratorExecutor] Report saved to: ${reportPath}`);

      // Step 4: Return NativeData with report metadata using the modular metadata creator
      return createReportMetadata({
        reportId,
        params,
        reportPath,
        publicUrl,
        reportFilename
      });

    } catch (error) {
      console.error('[ReportGeneratorExecutor] Report generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const wrappedError = new Error(`Report generation failed: ${errorMessage}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }


}
