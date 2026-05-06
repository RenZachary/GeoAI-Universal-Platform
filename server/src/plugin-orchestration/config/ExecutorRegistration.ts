/**
 * Executor Registration Configuration
 * 
 * Registers all plugin executors with the ExecutorRegistry on application startup.
 * This eliminates the need for switch-case statements in PluginToolWrapper.
 */

import type { Database } from 'better-sqlite3';
import { ExecutorRegistryInstance, type ExecutorRegistration } from '../registry/ExecutorRegistry';

// Import all executor classes
import { BufferAnalysisExecutor } from '../executor/analysis/BufferAnalysisExecutor';
import { OverlayAnalysisExecutor } from '../executor/analysis/OverlayAnalysisExecutor';
import { StatisticsCalculatorExecutor } from '../executor/analysis/StatisticsCalculatorExecutor';
import { FilterExecutor } from '../executor/analysis/FilterExecutor';
import { AggregationExecutor } from '../executor/analysis/AggregationExecutor';
import { ReportGeneratorExecutor } from '../executor/reporting/ReportGeneratorExecutor';
import { HeatmapExecutor } from '../executor/visualization/HeatmapExecutor';

// Phase 2: New visualization renderers
import { UniformColorExecutor } from '../executor/visualization/UniformColorExecutor';
import { CategoricalExecutor } from '../executor/visualization/CategoricalExecutor';
import { ChoroplethExecutor } from '../executor/visualization/ChoroplethExecutor';

/**
 * Register all built-in executors
 * Call this function during application initialization
 */
export function registerAllExecutors(db: Database, workspaceBase: string): void {
  console.log('[Executor Registration] Registering all built-in executors...');

  const registrations: ExecutorRegistration[] = [
    // Analysis Executors
    {
      pluginId: 'buffer_analysis',
      factory: (db, workspaceBase) => new BufferAnalysisExecutor(db, workspaceBase)
    },
    {
      pluginId: 'overlay_analysis',
      factory: (db, workspaceBase) => new OverlayAnalysisExecutor(db, workspaceBase)
    },
    {
      pluginId: 'statistics_calculator',
      factory: (db, workspaceBase) => new StatisticsCalculatorExecutor(db, workspaceBase)
    },
    {
      pluginId: 'filter',
      factory: (db, workspaceBase) => new FilterExecutor(db, workspaceBase)
    },
    {
      pluginId: 'aggregation',
      factory: (db, workspaceBase) => new AggregationExecutor(db, workspaceBase)
    },

    // Visualization Executors
    {
      pluginId: 'heatmap',
      factory: (_db, workspaceBase) => new HeatmapExecutor(workspaceBase)
    },

    // Phase 2: New visualization renderers
    {
      pluginId: 'uniform_color_renderer',
      factory: (db, workspaceBase) => new UniformColorExecutor(db, workspaceBase)
    },
    {
      pluginId: 'categorical_renderer',
      factory: (db, workspaceBase) => new CategoricalExecutor(db, workspaceBase)
    },
    {
      pluginId: 'choropleth_renderer',
      factory: (db, workspaceBase) => new ChoroplethExecutor(db, workspaceBase)
    },

    // Reporting Executors
    {
      pluginId: 'report_generator',
      factory: (db, workspaceBase) => new ReportGeneratorExecutor(db, workspaceBase)
    }
  ];

  // Register all executors at once
  ExecutorRegistryInstance.registerMany(registrations);

  console.log(`[Executor Registration] Successfully registered ${registrations.length} executors`);
  console.log('[Executor Registration] Registered plugin IDs:', ExecutorRegistryInstance.getRegisteredPluginIds());
}

/**
 * Register a single executor (for dynamic registration)
 */
export function registerExecutor(
  pluginId: string,
  factory: (db: Database, workspaceBase: string) => any
): void {
  ExecutorRegistryInstance.register(pluginId, factory);
}

/**
 * Unregister an executor (for dynamic unregistration)
 */
export function unregisterExecutor(pluginId: string): void {
  ExecutorRegistryInstance.unregister(pluginId);
}

/**
 * Get list of all registered executor plugin IDs
 */
export function getRegisteredExecutorIds(): string[] {
  return ExecutorRegistryInstance.getRegisteredPluginIds();
}
