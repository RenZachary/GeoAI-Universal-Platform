/**
 * API Router - Defines all API routes
 */

import { Router } from 'express';
import { ChatController } from '../controllers/ChatController.js';
import { ToolController } from '../controllers/ToolController.js';
import { DataSourceController } from '../controllers/DataSourceController.js';
import { FileUploadController, upload } from '../controllers/FileUploadController.js';
import { PromptTemplateController } from '../controllers/PromptTemplateController.js';
import { PluginManagementController } from '../controllers/PluginManagementController.js';
import { MVTServiceController } from '../controllers/MVTServiceController.js';
import { MVTDynamicController } from '../controllers/MVTDynamicController.js';
import { WMSServiceController } from '../controllers/WMSServiceController.js';
import { ResultController } from '../controllers/ResultController.js';
import { LLMConfigController } from '../controllers/LLMConfigController.js';
import { DataSourceService, FileUploadService, PromptTemplateService } from '../../services';
import { DataSourceRepository } from '../../data-access/repositories';
import type Database from 'better-sqlite3';
import type { LLMConfig } from '../../llm-interaction';
import { ToolRegistry, type CustomPluginLoader } from '../../plugin-orchestration';

export class ApiRouter {
  private router: Router;
  private chatController: ChatController;
  private toolController: ToolController;
  private dataSourceController: DataSourceController;
  private fileUploadController: FileUploadController;
  private promptTemplateController: PromptTemplateController;
  private pluginManagementController?: PluginManagementController;
  private mvtServiceController: MVTServiceController;
  private mvtDynamicController: MVTDynamicController;
  private wmsServiceController: WMSServiceController;
  private resultController: ResultController;
  private llmConfigController: LLMConfigController;
  private toolRegistry: ToolRegistry;

  constructor(db: Database.Database, llmConfig: LLMConfig, workspaceBase: string, toolRegistry?: ToolRegistry, customPluginLoader?: CustomPluginLoader) {
    this.router = Router();
    
    // Use provided toolRegistry or create new one
    this.toolRegistry = toolRegistry || new ToolRegistry();
    
    // Initialize repositories
    const dataSourceRepo = new DataSourceRepository(db);
    
    // Initialize services (dependency injection)
    const dataSourceService = new DataSourceService(dataSourceRepo);
    const fileUploadService = new FileUploadService(dataSourceRepo, workspaceBase);
    const promptTemplateService = new PromptTemplateService(workspaceBase);
    
    // Initialize controllers with injected dependencies
    this.toolController = new ToolController(this.toolRegistry, db);
    this.chatController = new ChatController(db, llmConfig, this.toolRegistry, workspaceBase);
    this.dataSourceController = new DataSourceController(dataSourceService); // ✅ Injected service
    this.fileUploadController = new FileUploadController(fileUploadService); // ✅ Injected service
    this.promptTemplateController = new PromptTemplateController(promptTemplateService); // ✅ Injected service
    this.mvtServiceController = new MVTServiceController(workspaceBase, db);
    this.mvtDynamicController = new MVTDynamicController(workspaceBase, db, 10000);
    this.wmsServiceController = new WMSServiceController(workspaceBase, db);
    this.resultController = new ResultController(workspaceBase);
    this.llmConfigController = new LLMConfigController(workspaceBase);
    
    // Initialize plugin management controller if customPluginLoader is provided
    if (customPluginLoader) {
      this.pluginManagementController = new PluginManagementController(customPluginLoader, this.toolRegistry);
    }

    // Initialize tools
    this.toolController.initialize().catch((err: Error) => {
      console.error('[API Router] Failed to initialize tools:', err);
    });

    this.setupRoutes();
  }

  /**
   * Setup all API routes
   */
  private setupRoutes(): void {
    // Chat endpoints
    this.router.post('/chat', (req, res) => this.chatController.handleChat(req, res));
    this.router.get('/conversations', (req, res) => this.chatController.listConversations(req, res));
    this.router.get('/conversations/:id', (req, res) => this.chatController.getConversation(req, res));
    this.router.delete('/conversations/:id', (req, res) => this.chatController.deleteConversation(req, res));

    // Tool endpoints
    this.router.get('/tools', (req, res) => this.toolController.listTools(req, res));
    this.router.get('/tools/:id', (req, res) => this.toolController.getTool(req, res));
    this.router.post('/tools/:id/execute', (req, res) => this.toolController.executeTool(req, res));
    this.router.post('/tools/register', (req, res) => this.toolController.registerTool(req, res));
    this.router.delete('/tools/:id', (req, res) => this.toolController.unregisterTool(req, res));

    // Data source endpoints
    this.router.get('/data-sources', (req, res) => this.dataSourceController.listDataSources(req, res));
    this.router.get('/data-sources/available', (req, res) => this.dataSourceController.getAvailableDataSources(req, res));
    this.router.get('/data-sources/:id', (req, res) => this.dataSourceController.getDataSource(req, res));
    this.router.get('/data-sources/:id/schema', (req, res) => this.dataSourceController.getDataSourceSchema(req, res));
    this.router.post('/data-sources', (req, res) => this.dataSourceController.registerDataSource(req, res));
    this.router.post('/data-sources/postgis', (req, res) => this.dataSourceController.registerPostGISConnection(req, res));
    this.router.put('/data-sources/:id/metadata', (req, res) => this.dataSourceController.updateMetadata(req, res));
    this.router.delete('/data-sources/:id', (req, res) => this.dataSourceController.deleteDataSource(req, res));
    this.router.get('/data-sources/search', (req, res) => this.dataSourceController.searchDataSources(req, res));

    // File upload endpoints
    this.router.post('/upload/single', upload.single('file'), (req, res) => this.fileUploadController.uploadSingleFile(req, res));
    this.router.post('/upload/multiple', upload.array('files', 50), (req, res) => this.fileUploadController.uploadMultipleFiles(req, res));

    // Prompt template endpoints
    this.router.get('/prompts', (req, res) => this.promptTemplateController.listTemplates(req, res));
    this.router.get('/prompts/:id', (req, res) => this.promptTemplateController.getTemplate(req, res));
    this.router.post('/prompts', (req, res) => this.promptTemplateController.createTemplate(req, res));
    this.router.put('/prompts/:id', (req, res) => this.promptTemplateController.updateTemplate(req, res));
    this.router.delete('/prompts/:id', (req, res) => this.promptTemplateController.deleteTemplate(req, res));

    // Plugin management endpoints (only if pluginManagementController is initialized)
    if (this.pluginManagementController) {
      this.router.get('/plugins', (req, res) => this.pluginManagementController?.listPlugins(req, res));
      this.router.post('/plugins/scan', (req, res) => this.pluginManagementController?.scanPlugins(req, res));
      this.router.post('/plugins/upload', (req, res) => this.pluginManagementController?.uploadPlugin(req, res));
      this.router.post('/plugins/:id/disable', (req, res) => this.pluginManagementController?.disablePlugin(req, res));
      this.router.post('/plugins/:id/enable', (req, res) => this.pluginManagementController?.enablePlugin(req, res));
      this.router.delete('/plugins/:id', (req, res) => this.pluginManagementController?.deletePlugin(req, res));
    }

    // MVT service endpoints (pre-generated tiles)
    this.router.get('/services/mvt', (req, res) => this.mvtServiceController.listTilesets(req, res));
    this.router.get('/services/mvt/:tilesetId/metadata', (req, res) => this.mvtServiceController.getMetadata(req, res));
    this.router.get('/services/mvt/:tilesetId/:z/:x/:y.pbf', (req, res) => this.mvtServiceController.serveTile(req, res));
    this.router.delete('/services/mvt/:tilesetId', (req, res) => this.mvtServiceController.deleteTileset(req, res));

    // MVT dynamic publisher endpoints (on-demand tile generation)
    this.router.post('/mvt-dynamic/publish', (req, res) => this.mvtDynamicController.publish(req, res));
    this.router.get('/mvt-dynamic/list', (req, res) => this.mvtDynamicController.listTilesets(req, res));
    this.router.get('/mvt-dynamic/:tilesetId/metadata', (req, res) => this.mvtDynamicController.getMetadata(req, res));
    this.router.get('/mvt-dynamic/:tilesetId/:z/:x/:y.pbf', (req, res) => this.mvtDynamicController.getTile(req, res));
    this.router.delete('/mvt-dynamic/:tilesetId', (req, res) => this.mvtDynamicController.deleteTileset(req, res));

    // WMS service endpoints
    this.router.get('/services/wms', (req, res) => this.wmsServiceController.listServices(req, res));
    this.router.all('/services/wms/:serviceId', (req, res) => this.wmsServiceController.handleWMSRequest(req, res));
    this.router.get('/services/wms/:serviceId/metadata', (req, res) => this.wmsServiceController.getServiceMetadata(req, res));
    this.router.delete('/services/wms/:serviceId', (req, res) => this.wmsServiceController.deleteService(req, res));

    // Result serving endpoints
    this.router.get('/results/:id.geojson', (req, res) => this.resultController.serveGeoJSON(req, res));
    this.router.get('/results/:id.tif', (req, res) => this.resultController.serveGeoTIFF(req, res));
    this.router.get('/results/:id/heatmap.geojson', (req, res) => this.resultController.serveHeatmap(req, res));
    this.router.get('/results/:id/report.html', (req, res) => this.resultController.serveReport(req, res));
    this.router.get('/results/:id/metadata', (req, res) => this.resultController.getResultMetadata(req, res));

    // LLM configuration endpoints
    this.router.get('/llm/config', (req, res) => this.llmConfigController.getConfig(req, res));
    this.router.post('/llm/config', (req, res) => this.llmConfigController.saveConfig(req, res));
    this.router.delete('/llm/config', (req, res) => this.llmConfigController.deleteConfig(req, res));
    this.router.post('/llm/config/test', (req, res) => this.llmConfigController.testConnection(req, res));
  }

  /**
   * Get the Express router
   */
  getRouter(): Router {
    return this.router;
  }
}
