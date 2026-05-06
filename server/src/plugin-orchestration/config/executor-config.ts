/**
 * Executor Configuration Data
 * 
 * Pure configuration data for built-in executors.
 * This file contains only the mapping between plugin IDs and executor classes,
 * without any registration logic.
 */

// Import all executor classes
import { BufferAnalysisExecutor } from '../executor/analysis/BufferAnalysisExecutor';
import { OverlayAnalysisExecutor } from '../executor/analysis/OverlayAnalysisExecutor';
import { StatisticsCalculatorExecutor } from '../executor/analysis/StatisticsCalculatorExecutor';
import { FilterExecutor } from '../executor/analysis/FilterExecutor';
import { AggregationExecutor } from '../executor/analysis/AggregationExecutor';
import { HtmlReportGeneratorExecutor } from '../executor/reporting/HtmlReportGeneratorExecutor';
import { HeatmapExecutor } from '../executor/visualization/HeatmapExecutor';
import { DataSourceQueryExecutor } from '../executor/query/DataSourceQueryExecutor';
import { GeneralQAExecutor } from '../executor/query/GeneralQAExecutor';

// Phase 2: New visualization renderers
import { UniformColorExecutor } from '../executor/visualization/UniformColorExecutor';
import { CategoricalExecutor } from '../executor/visualization/CategoricalExecutor';
import { ChoroplethExecutor } from '../executor/visualization/ChoroplethExecutor';

/**
 * Executor class reference with metadata
 */
export interface ExecutorClassRef {
  pluginId: string;
  executorClass: new (db?: any, workspaceBase?: string) => any;
  requiresDb?: boolean;
  requiresWorkspace?: boolean;
}

/**
 * Built-in executor configurations
 * Defines which executor class handles which plugin
 */
export const BUILTIN_EXECUTORS: ExecutorClassRef[] = [
  // Analysis Executors
  {
    pluginId: 'buffer_analysis',
    executorClass: BufferAnalysisExecutor,
    requiresDb: true,
    requiresWorkspace: true
  },
  {
    pluginId: 'overlay_analysis',
    executorClass: OverlayAnalysisExecutor,
    requiresDb: true,
    requiresWorkspace: true
  },
  {
    pluginId: 'statistics_calculator',
    executorClass: StatisticsCalculatorExecutor,
    requiresDb: true,
    requiresWorkspace: true
  },
  {
    pluginId: 'filter',
    executorClass: FilterExecutor,
    requiresDb: true,
    requiresWorkspace: true
  },
  {
    pluginId: 'aggregation',
    executorClass: AggregationExecutor,
    requiresDb: true,
    requiresWorkspace: true
  },

  // Visualization Executors
  {
    pluginId: 'heatmap',
    executorClass: HeatmapExecutor,
    requiresDb: false,
    requiresWorkspace: true
  },

  // Phase 2: New visualization renderers
  {
    pluginId: 'uniform_color_renderer',
    executorClass: UniformColorExecutor,
    requiresDb: true,
    requiresWorkspace: true
  },
  {
    pluginId: 'categorical_renderer',
    executorClass: CategoricalExecutor,
    requiresDb: true,
    requiresWorkspace: true
  },
  {
    pluginId: 'choropleth_renderer',
    executorClass: ChoroplethExecutor,
    requiresDb: true,
    requiresWorkspace: true
  },

  // Reporting Executors
  {
    pluginId: 'report_generator',
    executorClass: HtmlReportGeneratorExecutor,
    requiresDb: false,
    requiresWorkspace: true
  },

  // Query Executors
  {
    pluginId: 'data_source_query',
    executorClass: DataSourceQueryExecutor,
    requiresDb: true,
    requiresWorkspace: false
  },
  {
    pluginId: 'general_qa',
    executorClass: GeneralQAExecutor,
    requiresDb: true,
    requiresWorkspace: false
  }
];
