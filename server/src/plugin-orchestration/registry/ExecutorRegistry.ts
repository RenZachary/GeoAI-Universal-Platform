/**
 * Executor Registry - Dynamic Plugin Executor Lookup System
 * 
 * Maps plugin IDs to their corresponding executor instances.
 * Supports hot-loading and dynamic registration of executors.
 * Eliminates the need for switch-case statements in PluginToolWrapper.
 */

import type { Database } from 'better-sqlite3';

// Executor interface that all plugin executors must implement
export interface IPluginExecutor {
  execute(params: Record<string, any>): Promise<any>;
}

// Executor factory function type
export type ExecutorFactory = (db: Database, workspaceBase: string) => IPluginExecutor;

// Executor metadata for registration
export interface ExecutorRegistration {
  pluginId: string;
  factory: ExecutorFactory;
}

export class ExecutorRegistry {
  private static instance: ExecutorRegistry;
  private executors: Map<string, ExecutorFactory> = new Map();
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  static getInstance(): ExecutorRegistry {
    if (!ExecutorRegistry.instance) {
      ExecutorRegistry.instance = new ExecutorRegistry();
    }
    return ExecutorRegistry.instance;
  }
  
  /**
   * Register an executor for a specific plugin
   */
  register(pluginId: string, factory: ExecutorFactory): void {
    if (this.executors.has(pluginId)) {
      console.warn(`[ExecutorRegistry] Executor for plugin ${pluginId} already registered. Overwriting.`);
    }
    
    this.executors.set(pluginId, factory);
    console.log(`[ExecutorRegistry] Registered executor for plugin: ${pluginId}`);
  }
  
  /**
   * Register multiple executors at once
   */
  registerMany(registrations: ExecutorRegistration[]): void {
    console.log(`[ExecutorRegistry] Registering ${registrations.length} executors...`);
    
    for (const registration of registrations) {
      this.register(registration.pluginId, registration.factory);
    }
    
    console.log(`[ExecutorRegistry] Total executors registered: ${this.executors.size}`);
  }
  
  /**
   * Unregister an executor
   */
  unregister(pluginId: string): void {
    if (this.executors.delete(pluginId)) {
      console.log(`[ExecutorRegistry] Unregistered executor for plugin: ${pluginId}`);
    } else {
      console.warn(`[ExecutorRegistry] Executor for plugin ${pluginId} not found`);
    }
  }
  
  /**
   * Get executor instance for a plugin
   */
  getExecutor(pluginId: string, db: Database, workspaceBase: string): IPluginExecutor | undefined {
    const factory = this.executors.get(pluginId);
    
    if (!factory) {
      console.warn(`[ExecutorRegistry] No executor registered for plugin: ${pluginId}`);
      return undefined;
    }
    
    // Create new executor instance using factory
    return factory(db, workspaceBase);
  }
  
  /**
   * Check if executor is registered for a plugin
   */
  hasExecutor(pluginId: string): boolean {
    return this.executors.has(pluginId);
  }
  
  /**
   * Get all registered plugin IDs
   */
  getRegisteredPluginIds(): string[] {
    return Array.from(this.executors.keys());
  }
  
  /**
   * Get total number of registered executors
   */
  getExecutorCount(): number {
    return this.executors.size;
  }
  
  /**
   * Clear all registered executors
   */
  clear(): void {
    this.executors.clear();
    console.log('[ExecutorRegistry] Cleared all executors');
  }
  
  /**
   * List all registered executors with metadata
   */
  listExecutors(): Array<{ pluginId: string; hasFactory: boolean }> {
    const result = [];
    
    for (const [pluginId, factory] of this.executors.entries()) {
      result.push({
        pluginId,
        hasFactory: typeof factory === 'function'
      });
    }
    
    return result;
  }
}

export const ExecutorRegistryInstance = ExecutorRegistry.getInstance();
