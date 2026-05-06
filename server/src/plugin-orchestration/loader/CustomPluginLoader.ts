/**
 * Custom Plugin Loader
 * Discovers, validates, and loads user-defined plugins from workspace
 */

import fs from 'fs';
import path from 'path';
import {  pathToFileURL } from 'url';
import type { Plugin, PluginCategory } from '../../core';
import { ToolRegistryInstance } from '../registry/ToolRegistry';
import { ExecutorRegistryInstance } from '../registry/ExecutorRegistry';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  inputSchema: any[];
  outputSchema: any;
  capabilities: string[];
  main?: string; // Entry point file (executor)
  dependencies?: string[];
}

export interface PluginStatus {
  id: string;
  name: string;
  version: string;
  status: 'enabled' | 'disabled' | 'error';
  error?: string;
  loadedAt?: Date;
}

export class CustomPluginLoader {
  private workspaceBase: string;
  private customPluginsDir: string;
  private pluginStatuses: Map<string, PluginStatus> = new Map();

  constructor(workspaceBase: string) {
    this.workspaceBase = workspaceBase;
    this.customPluginsDir = path.join(this.workspaceBase, 'plugins', 'custom');
    
    // Ensure custom plugins directory exists
    if (!fs.existsSync(this.customPluginsDir)) {
      fs.mkdirSync(this.customPluginsDir, { recursive: true });
    }
  }

  /**
   * Discover and load all custom plugins
   */
  async loadAllPlugins(): Promise<void> {
    console.log('[CustomPluginLoader] Scanning for custom plugins...');
    
    try {
      const pluginDirs = fs.readdirSync(this.customPluginsDir);
      let loadedCount = 0;
      let errorCount = 0;

      for (const dirName of pluginDirs) {
        const pluginPath = path.join(this.customPluginsDir, dirName);
        
        // Skip if not a directory
        if (!fs.statSync(pluginPath).isDirectory()) {
          continue;
        }

        try {
          await this.loadPlugin(pluginPath);
          loadedCount++;
        } catch (error) {
          console.error(`[CustomPluginLoader] Failed to load plugin ${dirName}:`, error);
          errorCount++;
          
          // Record error status
          this.pluginStatuses.set(dirName, {
            id: dirName,
            name: dirName,
            version: 'unknown',
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      console.log(`[CustomPluginLoader] Loaded ${loadedCount} plugins, ${errorCount} errors`);
    } catch (error) {
      console.error('[CustomPluginLoader] Failed to scan plugins directory:', error);
      throw error;
    }
  }

  /**
   * Load a single plugin from directory
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    const manifestPath = path.join(pluginPath, 'plugin.json');
    
    // Check if manifest exists
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Plugin manifest not found: ${manifestPath}`);
    }

    // Read and parse manifest
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest: PluginManifest = JSON.parse(manifestContent);

    // Validate manifest
    this.validateManifest(manifest);

    // Create Plugin object
    const plugin: Plugin = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      category: manifest.category as PluginCategory,
      inputSchema: manifest.inputSchema,
      outputSchema: manifest.outputSchema,
      capabilities: manifest.capabilities,
      isBuiltin: false,
      installedAt: new Date()
    };

    // Register with ToolRegistry (for LLM tool discovery)
    await ToolRegistryInstance.registerPlugin(plugin);

    // Load and register executor if specified
    if (manifest.main) {
      await this.loadAndRegisterExecutor(pluginPath, manifest);
    } else {
      console.warn(`[CustomPluginLoader] No executor specified for plugin ${manifest.id}. Plugin will return mock data.`);
    }

    // Update status
    this.pluginStatuses.set(manifest.id, {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      status: 'enabled',
      loadedAt: new Date()
    });

    console.log(`[CustomPluginLoader] Loaded plugin: ${manifest.name} v${manifest.version}`);
  }

  /**
   * Load executor module and register with ExecutorRegistry
   */
  private async loadAndRegisterExecutor(pluginPath: string, manifest: PluginManifest): Promise<void> {
    try {
      const executorPath = path.join(pluginPath, manifest.main!);
      
      // Check if executor file exists
      if (!fs.existsSync(executorPath)) {
        throw new Error(`Executor file not found: ${executorPath}`);
      }

      // Dynamically import the executor module
      // Convert to file:// URL for ESM compatibility
      const executorUrl = pathToFileURL(executorPath).href;
      const executorModule = await import(executorUrl);

      // Get the execute function (support both default export and named export)
      const executeFunction = executorModule.default || executorModule.execute;

      if (typeof executeFunction !== 'function') {
        throw new Error(`Executor must export an execute function. Got: ${typeof executeFunction}`);
      }

      // Register executor factory with ExecutorRegistry
      ExecutorRegistryInstance.register(
        manifest.id,
        (db, workspaceBase) => ({
          execute: async (params: Record<string, any>) => {
            try {
              // Call the custom executor with parameters
              const result = await executeFunction(params, { db, workspaceBase });
              
              // Ensure result has required fields
              if (!result || typeof result !== 'object') {
                throw new Error('Executor must return an object');
              }

              // Add default fields if missing
              return {
                id: result.id || `custom_${manifest.id}_${Date.now()}`,
                type: result.type || 'geojson',
                reference: result.reference || '',
                metadata: result.metadata || {},
                createdAt: result.createdAt || new Date(),
                ...result
              };
            } catch (error) {
              console.error(`[CustomPluginLoader] Executor execution failed for ${manifest.id}:`, error);
              throw error;
            }
          }
        })
      );

      console.log(`[CustomPluginLoader] Registered executor for plugin: ${manifest.id}`);
    } catch (error) {
      console.error(`[CustomPluginLoader] Failed to load executor for ${manifest.id}:`, error);
      throw error;
    }
  }

  /**
   * Validate plugin manifest structure
   */
  private validateManifest(manifest: PluginManifest): void {
    const requiredFields = ['id', 'name', 'version', 'description', 'category', 'inputSchema', 'outputSchema', 'capabilities'];
    
    for (const field of requiredFields) {
      if (!(field in manifest)) {
        throw new Error(`Missing required field in plugin manifest: ${field}`);
      }
    }

    // Validate ID format (alphanumeric and underscores only)
    if (!/^[a-zA-Z0-9_]+$/.test(manifest.id)) {
      throw new Error(`Invalid plugin ID: ${manifest.id}. Only alphanumeric characters and underscores allowed.`);
    }

    // Validate version format (semver)
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      throw new Error(`Invalid version format: ${manifest.version}. Use semver (e.g., 1.0.0)`);
    }

    // Validate inputSchema is array
    if (!Array.isArray(manifest.inputSchema)) {
      throw new Error('inputSchema must be an array');
    }

    // Validate capabilities is array
    if (!Array.isArray(manifest.capabilities)) {
      throw new Error('capabilities must be an array');
    }
    
    // Validate category is valid
    const validCategories: PluginCategory[] = ['analysis', 'visualization', 'data_import', 'report', 'utility'];
    if (!validCategories.includes(manifest.category as PluginCategory)) {
      throw new Error(`Invalid category: ${manifest.category}. Must be one of: ${validCategories.join(', ')}`);
    }
  }

  /**
   * Disable a plugin (unregister from ToolRegistry)
   */
  disablePlugin(pluginId: string): void {
    const status = this.pluginStatuses.get(pluginId);
    
    if (!status) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (status.status === 'disabled') {
      console.warn(`[CustomPluginLoader] Plugin already disabled: ${pluginId}`);
      return;
    }

    // Unregister from ToolRegistry
    ToolRegistryInstance.unregisterPlugin(pluginId);

    // Update status
    status.status = 'disabled';
    this.pluginStatuses.set(pluginId, status);

    console.log(`[CustomPluginLoader] Disabled plugin: ${pluginId}`);
  }

  /**
   * Enable a plugin (re-register with ToolRegistry)
   */
  async enablePlugin(pluginId: string): Promise<void> {
    const status = this.pluginStatuses.get(pluginId);
    
    if (!status) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (status.status === 'enabled') {
      console.warn(`[CustomPluginLoader] Plugin already enabled: ${pluginId}`);
      return;
    }

    // Reload plugin (this will also reload the executor)
    const pluginPath = path.join(this.customPluginsDir, pluginId);
    await this.loadPlugin(pluginPath);

    console.log(`[CustomPluginLoader] Enabled plugin: ${pluginId}`);
  }

  /**
   * Delete a plugin (remove from filesystem and registry)
   */
  deletePlugin(pluginId: string): void {
    const status = this.pluginStatuses.get(pluginId);
    
    if (!status) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const pluginPath = path.join(this.customPluginsDir, pluginId);

    // Unregister if enabled
    if (status.status === 'enabled') {
      ToolRegistryInstance.unregisterPlugin(pluginId);
    }

    // Remove from filesystem
    if (fs.existsSync(pluginPath)) {
      fs.rmSync(pluginPath, { recursive: true, force: true });
      console.log(`[CustomPluginLoader] Deleted plugin directory: ${pluginPath}`);
    }

    // Remove from status map
    this.pluginStatuses.delete(pluginId);

    console.log(`[CustomPluginLoader] Deleted plugin: ${pluginId}`);
  }

  /**
   * Get status of all custom plugins
   */
  getAllPluginStatuses(): PluginStatus[] {
    return Array.from(this.pluginStatuses.values());
  }

  /**
   * Get status of a specific plugin
   */
  getPluginStatus(pluginId: string): PluginStatus | undefined {
    return this.pluginStatuses.get(pluginId);
  }

  /**
   * Install a plugin from uploaded files
   */
  async installPlugin(pluginFiles: Array<{ name: string; content: Buffer }>): Promise<string> {
    // Find plugin.json in uploaded files
    const manifestFile = pluginFiles.find(f => f.name === 'plugin.json');
    
    if (!manifestFile) {
      throw new Error('plugin.json not found in uploaded files');
    }

    // Parse manifest
    const manifest: PluginManifest = JSON.parse(manifestFile.content.toString('utf-8'));
    
    // Validate manifest
    this.validateManifest(manifest);

    // Create plugin directory
    const pluginPath = path.join(this.customPluginsDir, manifest.id);
    
    if (fs.existsSync(pluginPath)) {
      throw new Error(`Plugin already exists: ${manifest.id}. Delete it first or use a different ID.`);
    }

    fs.mkdirSync(pluginPath, { recursive: true });

    // Save all files
    for (const file of pluginFiles) {
      const filePath = path.join(pluginPath, file.name);
      fs.writeFileSync(filePath, file.content);
    }

    console.log(`[CustomPluginLoader] Installed plugin: ${manifest.name} to ${pluginPath}`);

    // Load the plugin
    await this.loadPlugin(pluginPath);

    return manifest.id;
  }

  /**
   * Upload and install plugin from zip/tar archive (placeholder)
   */
  async installFromArchive(archivePath: string): Promise<string> {
    // TODO: Implement archive extraction
    // - Extract archive to temporary directory
    // - Find plugin.json
    // - Validate and install
    throw new Error('Archive installation not yet implemented');
  }
}
