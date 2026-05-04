/**
 * GeoAI-UP Server Entry Point
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WorkspaceManagerInstance, CleanupScheduler } from './storage/index.js';
import { SQLiteManagerInstance } from './storage/index.js';
import { ApiRouter } from './api/routes/index.js';
import { CustomPluginLoader } from './plugin-orchestration';
import { LLMConfigManagerInstance } from './services/LLMConfigService.js';
import { scanAndRegisterDataFiles } from './utils/DataDirectoryScanner.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize workspace and database from .env configuration
const WORKSPACE_BASE = process.env.WORKSPACE_DIR 
  ? path.resolve(__dirname, '..', process.env.WORKSPACE_DIR)
  : path.join(__dirname, '..', 'workspace');
WorkspaceManagerInstance.init(WORKSPACE_BASE);
SQLiteManagerInstance.init(WorkspaceManagerInstance.getDirectoryPath('DATABASE'));

// Initialize LLM configuration manager - loads from workspace/llm/config
LLMConfigManagerInstance.init(WORKSPACE_BASE);
const llmConfig = LLMConfigManagerInstance.loadConfig();
console.log('[Server] LLM Configuration loaded:', {
  provider: llmConfig.provider,
  model: llmConfig.model,
  hasApiKey: !!llmConfig.apiKey
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
async function startServer() {
  try {
    // Initialize storage layer
    console.log('Initializing storage layer...');
    WorkspaceManagerInstance.initialize();
    SQLiteManagerInstance.initialize();
      
    // Scan and register existing files in data directory
    console.log('Scanning data directory for existing files...');
    await scanAndRegisterDataFiles(WORKSPACE_BASE);
    
    // Initialize cleanup scheduler
    console.log('Initializing cleanup scheduler...');
    const cleanupScheduler = new CleanupScheduler(WORKSPACE_BASE, {
      tempFileMaxAge: 24 * 60 * 60 * 1000,           // 24 hours
      mvtServiceMaxAge: 7 * 24 * 60 * 60 * 1000,     // 7 days
      wmsServiceMaxAge: 7 * 24 * 60 * 60 * 1000,     // 7 days
      uploadFileMaxAge: 365 * 24 * 60 * 60 * 1000,   // 365 days (1 year) - preserve uploaded data sources
      interval: 60 * 60 * 1000,                       // 1 hour
      enableAutoCleanup: true
    });
    cleanupScheduler.start();
    console.log('Cleanup scheduler started');
    
    // Initialize plugin system
    console.log('Initializing plugin system...');
    const customPluginLoader = new CustomPluginLoader(WORKSPACE_BASE);
    await customPluginLoader.loadAllPlugins();
    console.log(`Plugin system initialized with ${customPluginLoader.getAllPluginStatuses().length} plugins`);
    
    // Initialize API routes after database is ready
    const apiRouter = new ApiRouter(llmConfig, WORKSPACE_BASE, customPluginLoader);
    app.use('/api', apiRouter.getRouter());
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`GeoAI-UP Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
