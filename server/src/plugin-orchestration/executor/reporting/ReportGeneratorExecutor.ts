/**
 * Report Generator Plugin Executor
 * Generates comprehensive analysis reports in HTML format
 */

import type { NativeData } from '../../../core/index';
import type Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

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

export class ReportGeneratorExecutor {
  private db: Database.Database;
  private workspaceBase: string;

  constructor(db: Database.Database, workspaceBase?: string) {
    this.db = db;
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
      // Step 1: Generate report ID and output path
      const reportId = `report_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const reportsDir = path.join(this.workspaceBase, 'results', 'reports');
      
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const reportFilename = `${reportId}.html`;
      const reportPath = path.join(reportsDir, reportFilename);

      // Step 2: Generate HTML content
      const htmlContent = this.generateHTMLReport(params, reportId);

      // Step 3: Write report to file
      fs.writeFileSync(reportPath, htmlContent, 'utf-8');
      console.log(`[ReportGeneratorExecutor] Report saved to: ${reportPath}`);

      // Step 4: Return NativeData with report metadata
      return {
        id: reportId,
        type: 'report', // Report type for proper service handling
        reference: `/api/results/reports/${reportFilename}`,
        metadata: {
          pluginId: 'report_generator',
          title: params.title,
          format: params.format || 'html',
          filePath: reportPath,
          publicUrl: `/api/results/reports/${reportFilename}`,
          generatedAt: new Date().toISOString(),
          author: params.author,
          organization: params.organization,
          includesCharts: params.includeCharts !== false,
          includesMaps: params.includeMaps !== false,
          resultsCount: params.analysisResults?.length || 0,
          servicesCount: params.visualizationServices?.length || 0,
          summary: params.summary,
          // REQUIRED: Standardized output field - the file path
          result: reportPath
        },
        createdAt: new Date()
      };

    } catch (error) {
      console.error('[ReportGeneratorExecutor] Report generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const wrappedError = new Error(`Report generation failed: ${errorMessage}`);
      (wrappedError as any).cause = error;
      throw wrappedError;
    }
  }

  /**
   * Generate HTML report content
   */
  private generateHTMLReport(params: ReportGeneratorParams, reportId: string): string {
    const timestamp = new Date().toLocaleString();
    
    // Normalize analysis results to handle different input formats from LLM
    const normalizedResults = params.analysisResults?.map(result => {
      // If result has 'data' field, use it directly
      if (result.data !== undefined) {
        return result;
      }
      
      // If result has 'value' field (LLM format), convert to 'data'
      if ('value' in result) {
        return {
          ...result,
          data: result.value,
          description: result.description || (result as any).label
        };
      }
      
      return result;
    }) || [];
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(params.title)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    h1 {
      color: #1e40af;
      font-size: 2em;
      margin-bottom: 10px;
    }
    
    .meta {
      color: #666;
      font-size: 0.9em;
    }
    
    .summary {
      background: #eff6ff;
      border-left: 4px solid #2563eb;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    
    .section {
      margin: 30px 0;
    }
    
    h2 {
      color: #1e40af;
      font-size: 1.5em;
      margin-bottom: 15px;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }
    
    .result-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 20px;
      margin: 15px 0;
    }
    
    .result-type {
      display: inline-block;
      background: #2563eb;
      color: white;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.85em;
      margin-bottom: 10px;
    }
    
    .service-card {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 15px;
      margin: 10px 0;
    }
    
    pre {
      background: #1f2937;
      color: #f3f4f6;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.9em;
      margin: 10px 0;
    }
    
    footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #666;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.escapeHtml(params.title)}</h1>
      <div class="meta">
        <p>Generated: ${timestamp}</p>
        ${params.author ? `<p>Author: ${this.escapeHtml(params.author)}</p>` : ''}
        ${params.organization ? `<p>Organization: ${this.escapeHtml(params.organization)}</p>` : ''}
      </div>
    </header>

    ${params.summary ? `
    <div class="summary">
      <h2>Executive Summary</h2>
      <p>${this.escapeHtml(params.summary)}</p>
    </div>
    ` : ''}

    ${normalizedResults && normalizedResults.length > 0 ? `
    <div class="section">
      <h2>Analysis Results</h2>
      ${normalizedResults.map(result => `
        <div class="result-card">
          <span class="result-type">${this.escapeHtml(result.type || 'unknown')}</span>
          ${result.description ? `<p><strong>Description:</strong> ${this.escapeHtml(result.description)}</p>` : ''}
          <pre>${this.escapeHtml(JSON.stringify(result.data, null, 2))}</pre>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${params.visualizationServices && params.visualizationServices.length > 0 ? `
    <div class="section">
      <h2>Visualization Services</h2>
      ${params.visualizationServices.map(service => `
        <div class="service-card">
          <p><strong>Type:</strong> ${this.escapeHtml(service.type || 'unknown')}</p>
          ${service.name ? `<p><strong>Name:</strong> ${this.escapeHtml(service.name)}</p>` : ''}
          ${service.layerId ? `<p><strong>Layer ID:</strong> ${this.escapeHtml(service.layerId)}</p>` : ''}
          ${service.source ? `<p><strong>Source:</strong> ${this.escapeHtml(service.source)}</p>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}

    <footer>
      <p>Generated by GeoAI-UP System</p>
      <p style="font-size: 0.8em; margin-top: 10px;">Report ID: ${reportId}</p>
    </footer>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string | undefined | null): string {
    if (text === undefined || text === null) {
      return '';
    }
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }
}
