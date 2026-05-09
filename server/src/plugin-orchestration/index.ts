/**
 * Plugin Orchestration Layer - DEPRECATED
 * 
 * This module is deprecated and will be removed in v2.1.
 * Use spatial-operators instead.
 */

// ============================================================================
// Registry (kept for backward compatibility during migration)
// ============================================================================
export { ExecutorRegistryInstance } from './registry/ExecutorRegistry';
export { PluginCapabilityRegistry } from './registry/PluginCapabilityRegistry';

// ============================================================================
// Registration (Batch registration functions - deprecated)
// ============================================================================
export {
  registerAllExecutors,
  registerAllPluginCapabilities,
  registerExecutor,
  unregisterExecutor,
  getRegisteredExecutorIds
} from './registration';

// ============================================================================
// Loader (deprecated - custom plugins will use SpatialOperator pattern)
// ============================================================================
export { CustomPluginLoader } from './loader/CustomPluginLoader';

// Deprecation warning
console.warn('[DEPRECATION] plugin-orchestration module is deprecated. Use spatial-operators instead.');
