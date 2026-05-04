/**
 * Built-in Plugins Index
 * Exports all built-in plugin definitions
 */

export { BufferAnalysisPlugin } from './analysis/BufferAnalysisPlugin';
export { OverlayAnalysisPlugin } from './analysis/OverlayAnalysisPlugin';
export { FilterPlugin } from './analysis/FilterPlugin';
export { AggregationPlugin } from './analysis/AggregationPlugin';
export { MVTPublisherPlugin } from './visualization/MVTPublisherPlugin';
export { StatisticsCalculatorPlugin } from './analysis/StatisticsCalculatorPlugin';
export { ReportGeneratorPlugin } from './reporting/ReportGeneratorPlugin';
export { HeatmapPlugin } from './visualization/HeatmapPlugin';

// Aggregate all built-in plugins for easy import
import { BufferAnalysisPlugin } from './analysis/BufferAnalysisPlugin';
import { OverlayAnalysisPlugin } from './analysis/OverlayAnalysisPlugin';
import { FilterPlugin } from './analysis/FilterPlugin';
import { AggregationPlugin } from './analysis/AggregationPlugin';
import { MVTPublisherPlugin } from './visualization/MVTPublisherPlugin';
import { StatisticsCalculatorPlugin } from './analysis/StatisticsCalculatorPlugin';
import { ReportGeneratorPlugin } from './reporting/ReportGeneratorPlugin';
import { HeatmapPlugin } from './visualization/HeatmapPlugin';

export const BUILT_IN_PLUGINS = [
  BufferAnalysisPlugin,
  OverlayAnalysisPlugin,
  FilterPlugin,
  AggregationPlugin,
  MVTPublisherPlugin,
  StatisticsCalculatorPlugin,
  ReportGeneratorPlugin,
  HeatmapPlugin
];
