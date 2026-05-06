/**
 * Built-in Plugins Index
 * Exports all built-in plugin definitions
 */

export { BufferAnalysisPlugin } from './analysis/BufferAnalysisPlugin';
export { OverlayAnalysisPlugin } from './analysis/OverlayAnalysisPlugin';
export { FilterPlugin } from './analysis/FilterPlugin';
export { AggregationPlugin } from './analysis/AggregationPlugin';
export { StatisticsCalculatorPlugin } from './analysis/StatisticsCalculatorPlugin';
export { ReportGeneratorPlugin } from './reporting/ReportGeneratorPlugin';
export { HeatmapPlugin } from './visualization/HeatmapPlugin';

// Phase 2: New visualization renderers
export { UniformColorRendererPlugin } from './visualization/UniformColorRendererPlugin';
export { CategoricalRendererPlugin } from './visualization/CategoricalRendererPlugin';
export { ChoroplethRendererPlugin } from './visualization/ChoroplethRendererPlugin';

// Aggregate all built-in plugins for easy import
import { BufferAnalysisPlugin } from './analysis/BufferAnalysisPlugin';
import { OverlayAnalysisPlugin } from './analysis/OverlayAnalysisPlugin';
import { FilterPlugin } from './analysis/FilterPlugin';
import { AggregationPlugin } from './analysis/AggregationPlugin';
import { StatisticsCalculatorPlugin } from './analysis/StatisticsCalculatorPlugin';
import { ReportGeneratorPlugin } from './reporting/ReportGeneratorPlugin';
import { HeatmapPlugin } from './visualization/HeatmapPlugin';

// Phase 2: New visualization renderers
import { UniformColorRendererPlugin } from './visualization/UniformColorRendererPlugin';
import { CategoricalRendererPlugin } from './visualization/CategoricalRendererPlugin';
import { ChoroplethRendererPlugin } from './visualization/ChoroplethRendererPlugin';

export const BUILT_IN_PLUGINS = [
  BufferAnalysisPlugin,
  OverlayAnalysisPlugin,
  FilterPlugin,
  AggregationPlugin,
  StatisticsCalculatorPlugin,
  ReportGeneratorPlugin,
  HeatmapPlugin,
  // Phase 2: New renderers
  UniformColorRendererPlugin,
  CategoricalRendererPlugin,
  ChoroplethRendererPlugin
];
