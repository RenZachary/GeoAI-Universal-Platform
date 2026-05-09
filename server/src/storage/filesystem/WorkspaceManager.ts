/**
 * Workspace Manager - Manages directory structure and file operations
 */

import fs from 'fs';
import path from 'path';
import { 
  WORKSPACE_DIRS} from '../../core';
import type { WorkspaceInfo, WorkspaceDirectories } from '../../core';
import { formatBytes } from '../../core';

class WorkspaceManager {
  private static instance: WorkspaceManager | null = null;
  static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager();
    }
    return WorkspaceManager.instance;
  }
  private baseDir: string | undefined;
  
  private constructor() {
  }
  init(baseDir: string): void {
    this.baseDir = baseDir;
  }
  
  /**
   * Initialize workspace directory structure
   */
  initialize(): WorkspaceInfo {
    console.log('Initializing workspace...');
    
    // Ensure all directories exist
    this.ensureDirectories();
    
    // Get workspace info
    const info = this.getWorkspaceInfo();
    
    console.log(`Workspace initialized at: ${this.baseDir}`);
    console.log(`Storage usage: ${formatBytes(info.storageUsage)}`);
    
    return info;
  }
  
  /**
   * Ensure all required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      WORKSPACE_DIRS.DATA_LOCAL,
      WORKSPACE_DIRS.DATA_POSTGIS,
      WORKSPACE_DIRS.LLM_CONFIG,
      WORKSPACE_DIRS.LLM_PROMPTS_EN_US,
      WORKSPACE_DIRS.LLM_PROMPTS_ZH_CN,
      WORKSPACE_DIRS.PLUGINS_BUILTIN,
      WORKSPACE_DIRS.PLUGINS_CUSTOM,
      WORKSPACE_DIRS.DATABASE,
      WORKSPACE_DIRS.DATABASE_BACKUPS,
      WORKSPACE_DIRS.TEMP,
      WORKSPACE_DIRS.RESULTS_GEOJSON,
      WORKSPACE_DIRS.RESULTS_SHAPEFILE,
      WORKSPACE_DIRS.RESULTS_MVT,
      WORKSPACE_DIRS.RESULTS_WMS,
      WORKSPACE_DIRS.RESULTS_REPORTS,
    ];
    if (!this.baseDir) 
    {
      console.warn('Base directory not set. Please call init() first.');
      return;
    }
    dirs.forEach(dir => {
      const fullPath = path.join(this.baseDir || '', dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }
  

  /**
   * Get workspace information
   */
  getWorkspaceInfo(): WorkspaceInfo {
    const storageUsage = this.calculateStorageUsage();
    if (!this.baseDir) {
      console.warn('Base directory not set. Please call init() first.');
      return { baseDir: '', directories: {} as WorkspaceDirectories, storageUsage: 0, updatedAt: new Date() };
    }

    const directories: WorkspaceDirectories = {
      dataLocal: path.join(this.baseDir, WORKSPACE_DIRS.DATA_LOCAL),
      dataPostgis: path.join(this.baseDir, WORKSPACE_DIRS.DATA_POSTGIS),
      llmConfig: path.join(this.baseDir, WORKSPACE_DIRS.LLM_CONFIG),
      llmPromptsEnUS: path.join(this.baseDir, WORKSPACE_DIRS.LLM_PROMPTS_EN_US),
      llmPromptsZhCN: path.join(this.baseDir, WORKSPACE_DIRS.LLM_PROMPTS_ZH_CN),
      pluginsBuiltin: path.join(this.baseDir, WORKSPACE_DIRS.PLUGINS_BUILTIN),
      pluginsCustom: path.join(this.baseDir, WORKSPACE_DIRS.PLUGINS_CUSTOM),
      database: path.join(this.baseDir, WORKSPACE_DIRS.DATABASE),
      databaseBackups: path.join(this.baseDir, WORKSPACE_DIRS.DATABASE_BACKUPS),
      temp: path.join(this.baseDir, WORKSPACE_DIRS.TEMP),
      resultsGeojson: path.join(this.baseDir, WORKSPACE_DIRS.RESULTS_GEOJSON),
      resultsShapefile: path.join(this.baseDir, WORKSPACE_DIRS.RESULTS_SHAPEFILE),
      resultsMvt: path.join(this.baseDir, WORKSPACE_DIRS.RESULTS_MVT),
      resultsWms: path.join(this.baseDir, WORKSPACE_DIRS.RESULTS_WMS),
      resultsReports: path.join(this.baseDir, WORKSPACE_DIRS.RESULTS_REPORTS),
    };
    
    return {
      baseDir: this.baseDir,
      directories,
      storageUsage,
      updatedAt: new Date(),
    };
  }
  
  /**
   * Calculate total storage usage
   */
  private calculateStorageUsage(): number {
    if (!this.baseDir) {
      console.warn('Base directory not set. Please call init() first.');
      return 0;
    }
    try {
      const stats = fs.statSync(this.baseDir);
      
      if (!stats.isDirectory()) {
        return stats.size;
      }
      
      let totalSize = 0;
      const items = fs.readdirSync(this.baseDir);
      
      for (const item of items) {
        const itemPath = path.join(this.baseDir, item);
        const itemStats = fs.statSync(itemPath);
        
        if (itemStats.isDirectory()) {
          totalSize += this.getDirectorySize(itemPath);
        } else {
          totalSize += itemStats.size;
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('Failed to calculate storage usage:', error);
      return 0;
    }
  }
  
  /**
   * Get directory size recursively
   */
  private getDirectorySize(dirPath: string): number {
    let size = 0;
    
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          size += this.getDirectorySize(itemPath);
        } else {
          size += stats.size;
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory: ${dirPath}`, error);
    }
    
    return size;
  }
  
  /**
   * Check storage usage and return warning status
   */
  checkStorageWarning(): {
    usagePercent: number;
    status: 'normal' | 'warning' | 'critical';
    message?: string;
  } {
    // Disk space monitoring - implement if needed for production
    // Can use 'diskusage' npm package or Node.js fs.statfs
    return {
      usagePercent: 0,
      status: 'normal',
    };
  }
  
  /**
   * Clean up temporary files
   */
  async cleanupTemp(): Promise<void> {
    if (!this.baseDir) {
      console.warn('Base directory not set. Please call init() first.');
      return;
    }
    const tempDir = path.join(this.baseDir, WORKSPACE_DIRS.TEMP);
    
    try {
      // Remove all files in temp directory
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
        }
      }
      console.log('Temporary files cleaned up');
    } catch (error) {
      console.error('Failed to clean temp directory:', error);
    }
  }
  
  /**
   * Get path for a specific directory
   */
  getDirectoryPath(dirName: keyof typeof WORKSPACE_DIRS): string {
    if (!this.baseDir) {
      console.warn('Base directory not set. Please call init() first.');
      return '';
    }
    return path.join(this.baseDir, WORKSPACE_DIRS[dirName]);
  }
  
  /**
   * Get full path for a file in a directory
   */
  getFilePath(dirName: keyof typeof WORKSPACE_DIRS, fileName: string): string {
    if (!this.baseDir) {
      console.warn('Base directory not set. Please call init() first.');
      return '';
    }
    return path.join(this.baseDir, WORKSPACE_DIRS[dirName], fileName);
  }
}
export const WorkspaceManagerInstance = WorkspaceManager.getInstance();
