/**
 * Executor Registration
 * 
 * Registers all plugin executors with the ExecutorRegistry on application startup.
 * This eliminates the need for switch-case statements in PluginToolWrapper.
 */

import type { Database } from 'better-sqlite3';
import { ExecutorRegistryInstance, type ExecutorRegistration } from '../registry/ExecutorRegistry';
import { BUILTIN_EXECUTORS } from '../config/executor-config';

/**
 * Register all built-in executors
 * Call this function during application initialization
 */
export function registerAllExecutors(): void {
  console.log('[Executor Registration] Registering all built-in executors...');

  const registrations: ExecutorRegistration[] = BUILTIN_EXECUTORS.map(config => ({
    pluginId: config.pluginId,
    factory: (db, workspaceBase) => {
      // Create executor instance based on configuration
      if (config.requiresDb && config.requiresWorkspace) {
        return new config.executorClass(db, workspaceBase);
      } else if (config.requiresWorkspace) {
        return new config.executorClass(workspaceBase);
      } else if (config.requiresDb) {
        return new config.executorClass(db);
      } else {
        return new config.executorClass();
      }
    }
  }));

  // Register all executors at once
  ExecutorRegistryInstance.registerMany(registrations);

  console.log(`[Executor Registration] Successfully registered ${registrations.length} executors`);
 //console.log('[Executor Registration] Registered plugin IDs:', ExecutorRegistryInstance.getRegisteredPluginIds());
}

/**
 * Register a single executor (for dynamic registration)
 */
export function registerExecutor(
  pluginId: string,
  factory: (db: Database, workspaceBase: string) => import('../registry/ExecutorRegistry').IPluginExecutor
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
