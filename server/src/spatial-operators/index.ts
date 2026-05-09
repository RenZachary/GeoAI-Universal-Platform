/**
 * Spatial Operators Module
 * 
 * Unified operator architecture replacing Plugin/Executor/Tool layers.
 */

// Core types and base classes
export { SpatialOperator, type OperatorContext, type OperatorResult } from './SpatialOperator';
export { SpatialOperatorRegistry, SpatialOperatorRegistryInstance } from './SpatialOperatorRegistry';

// Data Access Facade (NEW v2.0)
export { DataAccessFacade, type VisualizationOptions } from '../data-access/facade/DataAccessFacade';

// Analysis Operators
export { BufferOperator } from './operators/BufferOperator';
export { OverlayOperator } from './operators/OverlayOperator';
export { FilterOperator } from './operators/FilterOperator';
export { AggregationOperator } from './operators/AggregationOperator';
export { StatisticsCalculatorOperator } from './operators/StatisticsCalculatorOperator';

// Query Operators
export { DataSourceQueryOperator } from './operators/DataSourceQueryOperator';
export { GeneralQAOperator } from './operators/GeneralQAOperator';

// Visualization Operators
export { ChoroplethOperator } from './operators/ChoroplethOperator';
export { HeatmapOperator } from './operators/HeatmapOperator';
export { CategoricalOperator } from './operators/CategoricalOperator';
export { UniformColorOperator } from './operators/UniformColorOperator';

// Registration function
import { SpatialOperatorRegistryInstance } from './SpatialOperatorRegistry';
import { BufferOperator } from './operators/BufferOperator';
import { OverlayOperator } from './operators/OverlayOperator';
import { FilterOperator } from './operators/FilterOperator';
import { AggregationOperator } from './operators/AggregationOperator';
import { StatisticsCalculatorOperator } from './operators/StatisticsCalculatorOperator';
import { DataSourceQueryOperator } from './operators/DataSourceQueryOperator';
import { GeneralQAOperator } from './operators/GeneralQAOperator';
import { ChoroplethOperator } from './operators/ChoroplethOperator';
import { HeatmapOperator } from './operators/HeatmapOperator';
import { CategoricalOperator } from './operators/CategoricalOperator';
import { UniformColorOperator } from './operators/UniformColorOperator';

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
