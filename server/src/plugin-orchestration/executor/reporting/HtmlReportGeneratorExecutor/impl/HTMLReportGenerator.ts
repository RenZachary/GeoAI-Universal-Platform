/**
 * HTML Report Generator Module
 * Handles the generation of HTML content for reports
 */

import type { ReportGeneratorParams } from '..';

export interface HTMLReportOptions {
  title: string;
  summary?: string;
  author?: string;
  organization?: string;
  analysisResults?: Array<{
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
  reportId: string;
}

/**
 * Generate HTML report content
 */
export function generateHTMLReport(options: HTMLReportOptions): string {
  const timestamp = new Date().toLocaleString();
  
  // Normalize analysis results to handle different input formats from LLM
  const normalizedResults = options.analysisResults?.map(result => {
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
  <title>${escapeHtml(options.title)}</title>
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
      <h1>${escapeHtml(options.title)}</h1>
      <div class="meta">
        <p>Generated: ${timestamp}</p>
        ${options.author ? `<p>Author: ${escapeHtml(options.author)}</p>` : ''}
        ${options.organization ? `<p>Organization: ${escapeHtml(options.organization)}</p>` : ''}
      </div>
    </header>

    ${options.summary ? `
    <div class="summary">
      <h2>Executive Summary</h2>
      <p>${escapeHtml(options.summary)}</p>
    </div>
    ` : ''}

    ${normalizedResults && normalizedResults.length > 0 ? `
    <div class="section">
      <h2>Analysis Results</h2>
      ${normalizedResults.map(result => `
        <div class="result-card">
          <span class="result-type">${escapeHtml(result.type || 'unknown')}</span>
          ${result.description ? `<p><strong>Description:</strong> ${escapeHtml(result.description)}</p>` : ''}
          <pre>${escapeHtml(JSON.stringify(result.data, null, 2))}</pre>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${options.visualizationServices && options.visualizationServices.length > 0 ? `
    <div class="section">
      <h2>Visualization Services</h2>
      ${options.visualizationServices.map(service => `
        <div class="service-card">
          <p><strong>Type:</strong> ${escapeHtml(service.type || 'unknown')}</p>
          ${service.name ? `<p><strong>Name:</strong> ${escapeHtml(service.name)}</p>` : ''}
          ${service.layerId ? `<p><strong>Layer ID:</strong> ${escapeHtml(service.layerId)}</p>` : ''}
          ${service.source ? `<p><strong>Source:</strong> ${escapeHtml(service.source)}</p>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}

    <footer>
      <p>Generated by GeoAI-UP System</p>
      <p style="font-size: 0.8em; margin-top: 10px;">Report ID: ${options.reportId}</p>
    </footer>
  </div>
</body>
</html>
    `.trim();
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string | undefined | null): string {
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