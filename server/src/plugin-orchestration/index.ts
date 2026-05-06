/**
 * Plugin Orchestration Layer - Main exports
 * Provides unified interface for plugin management, execution, and tools
 */

// ============================================================================
// Plugins (Definitions)
// ============================================================================
export {
  BufferAnalysisPlugin,
  OverlayAnalysisPlugin,
  StatisticsCalculatorPlugin,
  BUILT_IN_PLUGINS
} from './plugins';

// ============================================================================
// Executors (Implementation)
// ============================================================================
export {
  BufferAnalysisExecutor,
  OverlayAnalysisExecutor,
  StatisticsCalculatorExecutor,
  type BufferAnalysisParams,
  type OverlayAnalysisParams,
  type StatisticsCalculatorParams
} from './executor';

// ============================================================================
// Tools
// ============================================================================
export { PluginToolWrapper } from './tools/PluginToolWrapper';

// ============================================================================
// Registry
// ============================================================================
export { ToolRegistryInstance } from './registry/ToolRegistry';

// ============================================================================
// Loader
// ============================================================================
export { CustomPluginLoader } from './loader/CustomPluginLoader';
