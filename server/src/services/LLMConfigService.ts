/**
 * LLM Configuration Manager - Manages LLM provider configuration stored in workspace
 */

import fs from 'fs';
import path from 'path';
import type { LLMConfig } from '../llm-interaction/index.js';

export interface StoredLLMConfig extends LLMConfig {
  updatedAt: string;
}

export class LLMConfigManager {
  private configPath: string;

  constructor(workspaceBase: string) {
    this.configPath = path.join(workspaceBase, 'llm', 'config', 'llm-config.json');
    
    // Ensure directory exists
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * Load LLM configuration from file
   * Returns default config if file doesn't exist
   */
  loadConfig(): StoredLLMConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(data) as StoredLLMConfig;
      }
    } catch (error) {
      console.error('[LLMConfigManager] Failed to load config:', error);
    }

    // Return default configuration
    return this.getDefaultConfig();
  }

  /**
   * Save LLM configuration to file
   */
  saveConfig(config: LLMConfig): StoredLLMConfig {
    try {
      const storedConfig: StoredLLMConfig = {
        ...config,
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(this.configPath, JSON.stringify(storedConfig, null, 2), 'utf-8');
      console.log('[LLMConfigManager] Configuration saved successfully');
      
      return storedConfig;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[LLMConfigManager] Failed to save config:', errorMessage);
      const err = new Error(`Failed to save LLM configuration: ${errorMessage}`);
      Object.assign(err, { cause: error });
      throw err;
    }
  }

  /**
   * Get default LLM configuration
   */
  private getDefaultConfig(): StoredLLMConfig {
    return {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: '',
      temperature: 0.7,
      maxTokens: 2000,
      streaming: true,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Check if configuration exists
   */
  hasConfig(): boolean {
    return fs.existsSync(this.configPath);
  }

  /**
   * Delete configuration file
   */
  deleteConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
        console.log('[LLMConfigManager] Configuration deleted');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[LLMConfigManager] Failed to delete config:', errorMessage);
      const err = new Error(`Failed to delete LLM configuration: ${errorMessage}`);
      Object.assign(err, { cause: error });
      throw err;
    }
  }
}
