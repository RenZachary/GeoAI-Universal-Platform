/**
 * Workspace Manager - Manages directory structure and file operations
 */

import fs from 'fs';
import path from 'path';
import { 
  WORKSPACE_DIRS, 
  DEFAULT_PROMPT_TEMPLATES} from '../../core';
import type { WorkspaceInfo, WorkspaceDirectories } from '../../core';
import { formatBytes } from '../../core';

export class WorkspaceManager {
  private baseDir: string;
  
  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }
  
  /**
   * Initialize workspace directory structure
   */
  initialize(): WorkspaceInfo {
    console.log('Initializing workspace...');
    
    // Ensure all directories exist
    this.ensureDirectories();
    
    // Initialize default prompt templates
    this.initializeDefaultPrompts();
    
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
    
    dirs.forEach(dir => {
      const fullPath = path.join(this.baseDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
    
    // Initialize default prompt templates (if not exist)
    this.initializeDefaultPrompts();
  }
  
  /**
   * Initialize default prompt templates
   */
  private initializeDefaultPrompts(): void {
    const promptsDir = path.join(this.baseDir, WORKSPACE_DIRS.LLM_PROMPTS_EN_US);
    const defaultTemplates = [...DEFAULT_PROMPT_TEMPLATES];
    
    for (const template of defaultTemplates) {
      const templatePath = path.join(promptsDir, template);
      if (!fs.existsSync(templatePath)) {
        this.createDefaultTemplate(templatePath, template);
      }
    }
  }
  
  /**
   * Create default template file
   */
  private createDefaultTemplate(filePath: string, templateName: string): void {
    const templates: Record<string, string> = {
      'goal-splitting.md': `Identify and split the user's request into independent goals.\n\nUser input: {{userInput}}\n\nReturn a JSON array of goals:\n[\n  {\n    "id": "goal_1",\n    "description": "string",\n    "type": "visualization" | "analysis" | "report" | "query"\n  }\n]\n\nRules:\n- Each goal should be independently achievable\n- Don't plan execution steps yet, just identify goals\n- If only one goal, return array with single element\n`,
      
      'task-planning.md': `Create an execution plan for the given goal using available plugins and data sources.\n\nGoal: {{goalDescription}}\nGoal Type: {{goalType}}\n\nAvailable Data Sources:\n{{dataSourcesMetadata}}\n\nAvailable Plugins:\n{{availablePlugins}}\n\nContext from Previous Steps (if any):\n{{previousResults}}\n\nCreate a step-by-step execution plan. For each step specify:\n- pluginName: Which plugin to use\n- parameters: Parameters for the plugin\n- outputType: Expected output type\n\nConsiderations:\n- Choose appropriate plugins based on data source type\n- Respect NativeData principle (keep original format)\n- Handle errors gracefully\n- Return plan as JSON array of steps\n`,
      
      'response-summary.md': `Generate a friendly summary of the analysis results.\n\nGoals completed: {{completedGoals}}\nGoals failed: {{failedGoals}}\n\nResults:\n{{resultsSummary}}\n\nProvide a concise, helpful summary in natural language. Be clear about what succeeded and what failed.\n`,
    };
    
    const content = templates[templateName] || `# ${templateName}\n\nAdd your prompt template here.\n`;
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Created default template: ${templateName}`);
  }
  
  /**
   * Get workspace information
   */
  getWorkspaceInfo(): WorkspaceInfo {
    const storageUsage = this.calculateStorageUsage();
    
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
    // TODO: Implement disk space checking logic
    // For now, return normal status
    return {
      usagePercent: 0,
      status: 'normal',
    };
  }
  
  /**
   * Clean up temporary files
   */
  async cleanupTemp(): Promise<void> {
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
    return path.join(this.baseDir, WORKSPACE_DIRS[dirName]);
  }
  
  /**
   * Get full path for a file in a directory
   */
  getFilePath(dirName: keyof typeof WORKSPACE_DIRS, fileName: string): string {
    return path.join(this.baseDir, WORKSPACE_DIRS[dirName], fileName);
  }
}
