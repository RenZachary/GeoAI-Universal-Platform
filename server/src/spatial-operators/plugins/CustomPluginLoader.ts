/**
 * Custom Plugin Loader
 * Discovers, validates, and loads user-defined plugins from workspace
 */

import fs from 'fs';
import path from 'path';
import type { PluginCategory } from '../../core';
import { SpatialOperatorRegistryInstance } from '../SpatialOperatorRegistry';
import { CustomPluginAdapter } from '../core/CustomPluginAdapter';

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
  description: string;
  category: string;
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
            description: '',
            category: 'unknown',
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

    // Load the executor module path
    const mainFile = manifest.main || 'index.js';
    const executorPath = path.join(pluginPath, mainFile);
    
    if (!fs.existsSync(executorPath)) {
      throw new Error(`Plugin executor not found: ${executorPath}`);
    }

    // Get database instance from SQLiteManager
    const { SQLiteManagerInstance } = await import('../../storage');
    const db = SQLiteManagerInstance.getDatabase();

    // Create CustomPluginAdapter (wraps JS plugin as SpatialOperator)
    const adapter = new CustomPluginAdapter(
      manifest,
      executorPath,
      this.workspaceBase,
      db
    );

    // Register with SpatialOperatorRegistry
    SpatialOperatorRegistryInstance.register(adapter);
    console.log(`[CustomPluginLoader] Registered custom operator: ${manifest.name} (${manifest.id})`);

    // Also register with ToolRegistry for LLM integration
    const { ToolRegistryInstance } = await import('../../llm-interaction/tools/ToolRegistry');
    await ToolRegistryInstance.registerOperator(adapter);
    
    console.log(`[CustomPluginLoader] Registered LangChain tool for: ${manifest.name}`);

    // Update status
    this.pluginStatuses.set(manifest.id, {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      category: manifest.category,
      status: 'enabled',
      loadedAt: new Date()
    });

    console.log(`[CustomPluginLoader] Loaded plugin: ${manifest.name} v${manifest.version}`);
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
    const validCategories: PluginCategory[] = ['analysis', 'visualization', 'data_import', 'utility'];
    if (!validCategories.includes(manifest.category as PluginCategory)) {
      throw new Error(`Invalid category: ${manifest.category}. Must be one of: ${validCategories.join(', ')}`);
    }
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    const status = this.pluginStatuses.get(pluginId);
    
    if (!status) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (status.status === 'disabled') {
      console.warn(`[CustomPluginLoader] Plugin already disabled: ${pluginId}`);
      return;
    }

    // Unregister from SpatialOperatorRegistry
    SpatialOperatorRegistryInstance.unregister(pluginId);

    // Also unregister from ToolRegistry
    const { ToolRegistryInstance } = await import('../../llm-interaction/tools/ToolRegistry');
    ToolRegistryInstance.unregisterOperator(pluginId);

    // Update status
    status.status = 'disabled';
    this.pluginStatuses.set(pluginId, status);

    console.log(`[CustomPluginLoader] Disabled plugin: ${pluginId}`);
  }

  /**
   * Enable a plugin
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

    // Reload plugin
    const pluginPath = path.join(this.customPluginsDir, pluginId);
    await this.loadPlugin(pluginPath);

    console.log(`[CustomPluginLoader] Enabled plugin: ${pluginId}`);
  }

  /**
   * Delete a plugin (remove from filesystem and registry)
   */
  async deletePlugin(pluginId: string): Promise<void> {
    const status = this.pluginStatuses.get(pluginId);
    
    if (!status) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    const pluginPath = path.join(this.customPluginsDir, pluginId);

    // Unregister if enabled
    if (status.status === 'enabled') {
      SpatialOperatorRegistryInstance.unregister(pluginId);
      
      // Also unregister from ToolRegistry
      const { ToolRegistryInstance } = await import('../../llm-interaction/tools/ToolRegistry');
      ToolRegistryInstance.unregisterOperator(pluginId);
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
   * Upload and install plugin from zip/tar archive
   * Note: Requires external library (adm-zip or tar) for extraction
   */
  async installFromArchive(archivePath: string): Promise<string> {
    // This feature requires additional dependencies:
    // - adm-zip for .zip files
    // - tar for .tar.gz files
    throw new Error('Archive installation requires external library. Please extract manually and use installPlugin() instead.');
  }
}
