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

// Registration function
import { SpatialOperatorRegistryInstance } from './SpatialOperatorRegistry';
import { BufferOperator } from './operators/analysis/BufferOperator';
import { OverlayOperator } from './operators/analysis/OverlayOperator';
import { AttributeFilterOperator } from './operators/analysis/AttributeFilterOperator';
import { IntersectsOperator } from './operators/analysis/IntersectsOperator';
import { WithinOperator } from './operators/analysis/WithinOperator';
import { ContainsOperator } from './operators/analysis/ContainsOperator';
import { CrossesOperator } from './operators/analysis/CrossesOperator';
import { TouchesOperator } from './operators/analysis/TouchesOperator';
import { OverlapsOperator } from './operators/analysis/OverlapsOperator';
import { DisjointOperator } from './operators/analysis/DisjointOperator';
import { DistanceLessThanOperator } from './operators/analysis/DistanceLessThanOperator';
import { DistanceGreaterThanOperator } from './operators/analysis/DistanceGreaterThanOperator';
import { NearestNeighborOperator } from './operators/analysis/NearestNeighborOperator';
import { AggregationOperator } from './operators/analysis/AggregationOperator';
import { StatisticsCalculatorOperator } from './operators/analysis/StatisticsCalculatorOperator';
import { SpatialJoinOperator } from './operators/analysis/SpatialJoinOperator';
import { ProximityOperator } from './operators/analysis/ProximityOperator';
import { DataSourceQueryOperator } from './operators/query/DataSourceQueryOperator';
import { DataSourceMetadataOperator } from './operators/query/DataSourceMetadataOperator';
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
    // Attribute filter
    new AttributeFilterOperator(db, workspaceBase),
    // Spatial relationship filters
    new IntersectsOperator(db, workspaceBase),
    new WithinOperator(db, workspaceBase),
    new ContainsOperator(db, workspaceBase),
    new CrossesOperator(db, workspaceBase),
    new TouchesOperator(db, workspaceBase),
    new OverlapsOperator(db, workspaceBase),
    new DisjointOperator(db, workspaceBase),
    // Distance-based filters
    new DistanceLessThanOperator(db, workspaceBase),
    new DistanceGreaterThanOperator(db, workspaceBase),
    new NearestNeighborOperator(db, workspaceBase),
    // Analysis operators
    new AggregationOperator(db, workspaceBase),
    new StatisticsCalculatorOperator(db, workspaceBase),
    new SpatialJoinOperator(db, workspaceBase),
    new ProximityOperator(db),
    // Query operators
    new DataSourceQueryOperator(db),
    new DataSourceMetadataOperator(db),
    new GeneralQAOperator(),
    // Visualization operators
    new ChoroplethOperator(db, workspaceBase),
    new HeatmapOperator(db, workspaceBase),
    new CategoricalOperator(db, workspaceBase),
    new UniformColorOperator(db, workspaceBase)
  ];
  
  SpatialOperatorRegistryInstance.registerMany(operators);
  console.log(`[Spatial Operators] Registered ${operators.length} operators`);
}
