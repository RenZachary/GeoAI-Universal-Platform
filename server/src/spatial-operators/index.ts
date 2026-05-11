/**
 * Spatial Operators Module
 * 
 * Unified operator architecture replacing Plugin/Executor/Tool layers.
 */

// Core types and base classes
export { SpatialOperator, type OperatorContext, type OperatorResult, type OperatorReturnType } from './SpatialOperator';
export { SpatialOutputSchema, AnalyticalOutputSchema } from './SpatialOperator';
export { SpatialOperatorRegistry, SpatialOperatorRegistryInstance } from './SpatialOperatorRegistry';

// Core utilities
export { ToolAdapter } from './core/ToolAdapter';

// Plugins support
export { CustomPluginLoader } from './plugins/CustomPluginLoader';
export type { PluginManifest, PluginStatus } from './plugins/CustomPluginLoader';

// Data Access Facade (NEW v2.0)
export { DataAccessFacade, type VisualizationOptions } from '../data-access/facade/DataAccessFacade';

// Analysis Operators
export { BufferOperator } from './operators/analysis/BufferOperator';
export { OverlayOperator } from './operators/analysis/OverlayOperator';
export { FilterOperator } from './operators/analysis/FilterOperator';
export { AggregationOperator } from './operators/analysis/AggregationOperator';
export { StatisticsCalculatorOperator } from './operators/analysis/StatisticsCalculatorOperator';

// Query Operators
export { DataSourceQueryOperator } from './operators/query/DataSourceQueryOperator';
export { GeneralQAOperator } from './operators/query/GeneralQAOperator';

// Visualization Operators
export { ChoroplethOperator } from './operators/visualization/ChoroplethOperator';
export { HeatmapOperator } from './operators/visualization/HeatmapOperator';
export { CategoricalOperator } from './operators/visualization/CategoricalOperator';
export { UniformColorOperator } from './operators/visualization/UniformColorOperator';

// Registration function
import { SpatialOperatorRegistryInstance } from './SpatialOperatorRegistry';
import { BufferOperator } from './operators/analysis/BufferOperator';
import { OverlayOperator } from './operators/analysis/OverlayOperator';
import { FilterOperator } from './operators/analysis/FilterOperator';
import { AggregationOperator } from './operators/analysis/AggregationOperator';
import { StatisticsCalculatorOperator } from './operators/analysis/StatisticsCalculatorOperator';
import { DataSourceQueryOperator } from './operators/query/DataSourceQueryOperator';
import { GeneralQAOperator } from './operators/query/GeneralQAOperator';
import { ChoroplethOperator } from './operators/visualization/ChoroplethOperator';
import { HeatmapOperator } from './operators/visualization/HeatmapOperator';
import { CategoricalOperator } from './operators/visualization/CategoricalOperator';
import { UniformColorOperator } from './operators/visualization/UniformColorOperator';

export function registerAllOperators(db?: any, workspaceBase?: string): void {
  console.log('[Spatial Operators] Registering all operators...');
  
  const operators = [
    new BufferOperator(db, workspaceBase),
    new OverlayOperator(db, workspaceBase),
    new FilterOperator(db, workspaceBase),
    new AggregationOperator(db, workspaceBase),
    new StatisticsCalculatorOperator(db, workspaceBase),
    new DataSourceQueryOperator(db),
    new GeneralQAOperator(),
    new ChoroplethOperator(db, workspaceBase),
    new HeatmapOperator(db, workspaceBase),
    new CategoricalOperator(db, workspaceBase),
    new UniformColorOperator(db, workspaceBase)
  ];
  
  SpatialOperatorRegistryInstance.registerMany(operators);
  console.log(`[Spatial Operators] Registered ${operators.length} operators`);
}
