/**
 * Plugin Orchestration Registration Index
 * 
 * Central export point for all registration functions.
 * Use this to register all components during application initialization.
 */

export { registerAllExecutors } from './registerExecutors';
export { registerAllPluginCapabilities } from './registerPluginCapabilities';

// Re-export helper functions for dynamic registration
export { registerExecutor, unregisterExecutor, getRegisteredExecutorIds } from './registerExecutors';
