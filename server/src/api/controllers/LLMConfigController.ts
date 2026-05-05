/**
 * LLM Configuration Controller - Handles LLM provider configuration API
 */

import type { Request, Response } from 'express';
import { LLMConfigManagerInstance } from '../../services/LLMConfigService';
import type { LLMConfig } from '../../llm-interaction/';

export class LLMConfigController {
  private configManager = LLMConfigManagerInstance;

  constructor() {
  }

  /**
   * GET /api/llm/config - Get current LLM configuration
   */
  async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = this.configManager.loadConfig();
      
      // Don't expose API key in response for security
      const safeConfig = {
        ...config,
        apiKey: config.apiKey ? '***' : ''
      };

      res.json({
        success: true,
        config: safeConfig
      });
    } catch (error) {
      console.error('[LLMConfigController] Failed to get config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve LLM configuration'
      });
    }
  }

  /**
   * POST /api/llm/config - Save LLM configuration
   */
  async saveConfig(req: Request, res: Response): Promise<void> {
    try {
      const config: LLMConfig = req.body;

      // Validate required fields
      if (!config.provider) {
        res.status(400).json({
          success: false,
          error: 'Provider is required'
        });
        return;
      }

      // Validate provider value
      const validProviders = ['openai', 'anthropic', 'ollama', 'qwen'];
      if (!validProviders.includes(config.provider)) {
        res.status(400).json({
          success: false,
          error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`
        });
        return;
      }

      // For non-ollama providers, API key is required
      if (config.provider !== 'ollama' && !config.apiKey) {
        res.status(400).json({
          success: false,
          error: 'API key is required for this provider'
        });
        return;
      }

      // Save configuration
      const savedConfig = this.configManager.saveConfig(config);

      // Don't expose API key in response
      const safeConfig = {
        ...savedConfig,
        apiKey: savedConfig.apiKey ? '***' : ''
      };

      res.json({
        success: true,
        config: safeConfig,
        message: 'LLM configuration saved successfully'
      });
    } catch (error) {
      console.error('[LLMConfigController] Failed to save config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save LLM configuration'
      });
    }
  }

  /**
   * DELETE /api/llm/config - Delete LLM configuration
   */
  async deleteConfig(req: Request, res: Response): Promise<void> {
    try {
      this.configManager.deleteConfig();
      
      res.json({
        success: true,
        message: 'LLM configuration deleted successfully'
      });
    } catch (error) {
      console.error('[LLMConfigController] Failed to delete config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete LLM configuration'
      });
    }
  }

  /**
   * POST /api/llm/config/test - Test LLM connection
   */
  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      const config: LLMConfig = req.body;

      // Import dynamically to avoid circular dependency
      const { LLMAdapterFactory } = await import('../../llm-interaction/adapters/LLMAdapterFactory');

      console.log('[LLMConfigController] Testing connection...');
      const isConnected = await LLMAdapterFactory.testConnection(config);

      res.json({
        success: true,
        connected: isConnected,
        message: isConnected ? 'Connection successful' : 'Connection failed'
      });
    } catch (error) {
      console.error('[LLMConfigController] Connection test failed:', error);
      res.json({
        success: true,
        connected: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
      });
    }
  }
}
