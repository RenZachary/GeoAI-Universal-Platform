/**
 * Report Generator Plugin Executor
 * Generates comprehensive HTML reports with analysis results, charts, and maps
 */

import type { NativeData } from '../../../core/index';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ReportGeneratorParams {
  title: string;
  analysisResults: any[];
  visualizationServices?: any[];
  summary?: string;
  format?: 'html' | 'pdf';
  includeCharts?: boolean;
  includeMaps?: boolean;
  author?: string;
  organization?: string;
}

export class ReportGeneratorExecutor {
  private workspaceBase: string;

  constructor(workspaceBase?: string) {
    this.workspaceBase = workspaceBase || path.join(__dirname, '..', '..', '..', '..', 'workspace');
  }

  async execute(params: ReportGeneratorParams): Promise<NativeData> {
    console.log('[ReportGeneratorExecutor] Generating report...');
    console.log('[ReportGeneratorExecutor] Title:', params.title);

    const {
      title,
      analysisResults,
      visualizationServices = [],
      summary = '',
      format = 'html',
      includeCharts = true,
      includeMaps = true,
      author = 'GeoAI-UP Platform',
      organization = ''
    } = params;

    try {
      // Generate report filename
      const timestamp = Date.now();
      const reportId = `report_${timestamp}`;
      const reportDir = path.join(this.workspaceBase, 'results', 'reports');
      
      // Ensure reports directory exists
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }

      const reportFileName = `${reportId}.html`;
      const reportFilePath = path.join(reportDir, reportFileName);

      // Generate HTML content
      const htmlContent = this.generateHTMLReport({
        title,
        analysisResults,
        visualizationServices,
        summary,
        includeCharts,
        includeMaps,
        author,
        organization,
        generatedAt: new Date().toISOString()
      });

      // Write report to file
      fs.writeFileSync(reportFilePath, htmlContent, 'utf-8');
      console.log(`[ReportGeneratorExecutor] Report saved to: ${reportFilePath}`);

      // Return NativeData with report path
      return {
        id: reportId,
        type: 'geojson',  // Using geojson as generic file type
        reference: reportFilePath,
        metadata: {
          reportId,
          title,
          format,
          filePath: reportFilePath,
          downloadUrl: `/api/results/reports/${reportFileName}`,
          fileSize: fs.statSync(reportFilePath).size,
          generatedAt: new Date().toISOString(),
          author,
          organization,
          resultCount: analysisResults.length,
          serviceCount: visualizationServices.length,
          includesCharts: includeCharts,
          includesMaps: includeMaps
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
   * Generate comprehensive HTML report
   */
  private generateHTMLReport(data: {
    title: string;
    analysisResults: any[];
    visualizationServices: any[];
    summary: string;
    includeCharts: boolean;
    includeMaps: boolean;
    author: string;
    organization: string;
    generatedAt: string;
  }): string {
    const {
      title,
      analysisResults,
      visualizationServices,
      summary,
      includeCharts,
      includeMaps,
      author,
      organization,
      generatedAt
    } = data;

    const generatedDate = new Date(generatedAt).toLocaleString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      border-radius: 8px;
    }
    
    header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    h1 {
      color: #1e40af;
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    
    .meta-info {
      color: #666;
      font-size: 0.9em;
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    
    .meta-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    h2 {
      color: #1e40af;
      font-size: 1.8em;
      margin-top: 30px;
      margin-bottom: 15px;
      border-left: 4px solid #2563eb;
      padding-left: 15px;
    }
    
    h3 {
      color: #374151;
      font-size: 1.3em;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    
    .summary-box {
      background: #eff6ff;
      border-left: 4px solid #2563eb;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    
    .result-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin: 15px 0;
      transition: box-shadow 0.2s;
    }
    
    .result-card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: 600;
    }
    
    .status-success {
      background: #d1fae5;
      color: #065f46;
    }
    
    .status-error {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .service-link {
      display: inline-block;
      background: #2563eb;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      text-decoration: none;
      margin: 5px 0;
      transition: background 0.2s;
    }
    
    .service-link:hover {
      background: #1e40af;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    
    .stat-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .stat-label {
      font-size: 0.9em;
      opacity: 0.9;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    
    th {
      background: #f3f4f6;
      font-weight: 600;
      color: #374151;
    }
    
    tr:hover {
      background: #f9fafb;
    }
    
    footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #666;
      font-size: 0.9em;
    }
    
    .placeholder-map {
      background: #e5e7eb;
      border: 2px dashed #9ca3af;
      border-radius: 8px;
      padding: 40px;
      text-align: center;
      color: #6b7280;
      margin: 15px 0;
    }
    
    @media print {
      body {
        background: white;
        padding: 0;
      }
      
      .container {
        box-shadow: none;
        padding: 20px;
      }
      
      .service-link {
        background: #1e40af !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${this.escapeHtml(title)}</h1>
      <div class="meta-info">
        <div class="meta-item">
          <strong>Generated:</strong> ${generatedDate}
        </div>
        ${author ? `<div class="meta-item"><strong>Author:</strong> ${this.escapeHtml(author)}</div>` : ''}
        ${organization ? `<div class="meta-item"><strong>Organization:</strong> ${this.escapeHtml(organization)}</div>` : ''}
        <div class="meta-item">
          <strong>Platform:</strong> GeoAI-UP
        </div>
      </div>
    </header>

    ${summary ? `
    <section>
      <h2>Executive Summary</h2>
      <div class="summary-box">
        <p>${this.escapeHtml(summary)}</p>
      </div>
    </section>
    ` : ''}

    <section>
      <h2>Analysis Overview</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${analysisResults.length}</div>
          <div class="stat-label">Analysis Steps</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${visualizationServices.length}</div>
          <div class="stat-label">Visualization Services</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${analysisResults.filter(r => r.status === 'success').length}</div>
          <div class="stat-label">Successful Operations</div>
        </div>
      </div>
    </section>

    <section>
      <h2>Analysis Results</h2>
      ${analysisResults.map((result, index) => this.generateResultCard(result, index)).join('')}
    </section>

    ${visualizationServices.length > 0 && includeMaps ? `
    <section>
      <h2>Visualization Services</h2>
      <table>
        <thead>
          <tr>
            <th>Service Type</th>
            <th>Service URL</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${visualizationServices.map(service => `
            <tr>
              <td>${this.escapeHtml(service.serviceType || 'Unknown')}</td>
              <td><code>${this.escapeHtml(service.serviceUrl || 'N/A')}</code></td>
              <td>
                <a href="${this.escapeHtml(service.serviceUrl || '#')}" class="service-link" target="_blank">
                  View Service
                </a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
    ` : ''}

    ${includeCharts ? `
    <section>
      <h2>Statistical Charts</h2>
      <div class="placeholder-map">
        <p>📊 Charts will be rendered here when statistical data is available</p>
        <p style="font-size: 0.9em; margin-top: 10px;">
          Integration with Chart.js or D3.js can be added for dynamic chart generation
        </p>
      </div>
    </section>
    ` : ''}

    ${includeMaps ? `
    <section>
      <h2>Map Visualizations</h2>
      <div class="placeholder-map">
        <p>🗺️ Interactive maps will be rendered here</p>
        <p style="font-size: 0.9em; margin-top: 10px;">
          Integration with Leaflet, Mapbox GL JS, or OpenLayers can be added for interactive map embedding
        </p>
      </div>
    </section>
    ` : ''}

    <footer>
      <p>Report generated by <strong>GeoAI-UP Platform</strong></p>
      <p style="margin-top: 5px; font-size: 0.85em;">
        Powered by AI-driven geospatial analysis
      </p>
    </footer>
  </div>
</body>
</html>`;
  }

  /**
   * Generate individual result card HTML
   */
  private generateResultCard(result: any, index: number): string {
    const statusClass = result.status === 'success' ? 'status-success' : 'status-error';
    const statusIcon = result.status === 'success' ? '✅' : '❌';

    return `
    <div class="result-card">
      <div class="result-header">
        <h3>Step ${index + 1}: ${this.escapeHtml(result.stepId || 'Unknown Step')}</h3>
        <span class="status-badge ${statusClass}">
          ${statusIcon} ${this.escapeHtml(result.status || 'unknown')}
        </span>
      </div>
      <p><strong>Plugin:</strong> ${this.escapeHtml(result.pluginId || 'N/A')}</p>
      ${result.data ? `
      <div style="margin-top: 10px;">
        <strong>Result Data:</strong>
        <pre style="background: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto; margin-top: 5px;">${this.escapeHtml(JSON.stringify(result.data, null, 2))}</pre>
      </div>
      ` : ''}
      ${result.error ? `
      <div style="margin-top: 10px; color: #dc2626;">
        <strong>Error:</strong> ${this.escapeHtml(result.error)}
      </div>
      ` : ''}
    </div>`;
  }

  /**
   * Escape HTML special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    if (!text) return '';
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}
