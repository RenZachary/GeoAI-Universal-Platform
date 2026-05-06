/**
 * Report File Operations Module
 * Handles file system operations for report generation
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ReportFileOptions {
  workspaceBase: string;
  reportId?: string;
}

export interface ReportFileResult {
  reportId: string;
  reportPath: string;
  reportFilename: string;
  publicUrl: string;
}

/**
 * Generate a unique report ID
 */
export function generateReportId(): string {
  return `report_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Ensure reports directory exists and return file paths
 */
export function prepareReportFile(options: ReportFileOptions): ReportFileResult {
  const reportId = options.reportId || generateReportId();
  const reportsDir = path.join(options.workspaceBase, 'results', 'reports');
  
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportFilename = `${reportId}.html`;
  const reportPath = path.join(reportsDir, reportFilename);
  const publicUrl = `/api/results/reports/${reportFilename}`;

  return {
    reportId,
    reportPath,
    reportFilename,
    publicUrl
  };
}

/**
 * Write report content to file
 */
export function writeReportFile(reportPath: string, content: string): void {
  fs.writeFileSync(reportPath, content, 'utf-8');
}