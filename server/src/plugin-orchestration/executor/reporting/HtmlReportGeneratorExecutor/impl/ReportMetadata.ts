/**
 * Report Metadata Module
 * Handles creation and management of report metadata
 */

import type { NativeData } from '../../../../../core/index';
import type { ReportGeneratorParams } from '..';

export interface ReportMetadataOptions {
  reportId: string;
  params: ReportGeneratorParams;
  reportPath: string;
  publicUrl: string;
  reportFilename: string;
}

/**
 * Create NativeData object with report metadata
 */
export function createReportMetadata(options: ReportMetadataOptions): NativeData {
  const { reportId, params, reportPath, publicUrl, reportFilename } = options;

  return {
    id: reportId,
    type: 'report', // Report type for proper service handling
    reference: publicUrl,
    metadata: {
      pluginId: 'report_generator',
      title: params.title,
      format: params.format || 'html',
      filePath: reportPath,
      publicUrl: publicUrl,
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
}