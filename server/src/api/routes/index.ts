/**
 * API Router - Defines all API routes
 */

import { Router } from 'express';
import { ChatController } from '../controllers/ChatController';
import { ToolController } from '../controllers/ToolController';
import { DataSourceController } from '../controllers/DataSourceController';
import { FileUploadController, upload, handleMultipartEncoding } from '../controllers/FileUploadController';
import { PromptTemplateController } from '../controllers/PromptTemplateController';
import { PluginManagementController } from '../controllers/PluginManagementController';
import { MVTServiceController } from '../controllers/MVTServiceController';
import { MVTOnDemandController } from '../controllers/MVTDynamicController';
import { WMSServiceController } from '../controllers/WMSServiceController';
import { ResultController } from '../controllers/ResultController';
import { LLMConfigController } from '../controllers/LLMConfigController';
import { DataSourceService, FileUploadService, PromptTemplateService, getMVTOnDemandPublisher, ConversationService } from '../../services';
import { DataSourceRepository } from '../../data-access/repositories';
import type { LLMConfig } from '../../llm-interaction';
import {  type CustomPluginLoader } from '../../plugin-orchestration';
import { SQLiteManagerInstance } from '../../storage/';

export class ApiRouter {
  private router: Router;
  private chatController: ChatController;
  private toolController: ToolController;
  private dataSourceController: DataSourceController;
  private fileUploadController: FileUploadController;
  private promptTemplateController: PromptTemplateController;
  private pluginManagementController?: PluginManagementController;
  private mvtServiceController: MVTServiceController;
  private mvtOnDemandController: MVTOnDemandController;
  private wmsServiceController: WMSServiceController;
  private resultController: ResultController;
  private llmConfigController: LLMConfigController;

  constructor(llmConfig: LLMConfig, workspaceBase: string, customPluginLoader?: CustomPluginLoader) {
    this.router = Router();
    const db = SQLiteManagerInstance.getDatabase();    
    // Initialize repositories
    const dataSourceRepo = new DataSourceRepository(db);
    
    // Initialize services (dependency injection)
    const dataSourceService = new DataSourceService(dataSourceRepo, workspaceBase);
    const fileUploadService = new FileUploadService(dataSourceRepo, workspaceBase);
    const promptTemplateService = new PromptTemplateService(workspaceBase);
    const conversationService = new ConversationService(db);
    
    // Initialize controllers with injected dependencies
    this.toolController = new ToolController(workspaceBase);
    this.chatController = new ChatController(llmConfig, workspaceBase, conversationService);
    
    // Initialize shared MVTOnDemandPublisher singleton
    const mvtOnDemandPublisher = getMVTOnDemandPublisher(workspaceBase, 10000);
    
    this.dataSourceController = new DataSourceController(dataSourceService, db, workspaceBase, mvtOnDemandPublisher); // ✅ Injected service with shared publisher
    this.fileUploadController = new FileUploadController(fileUploadService); // ✅ Injected service
    this.promptTemplateController = new PromptTemplateController(promptTemplateService); // ✅ Injected service
    this.mvtServiceController = new MVTServiceController(workspaceBase, db);
    this.mvtOnDemandController = new MVTOnDemandController(mvtOnDemandPublisher); // ✅ Use shared publisher
    this.wmsServiceController = new WMSServiceController(workspaceBase, db);
    this.resultController = new ResultController(workspaceBase);
    this.llmConfigController = new LLMConfigController();
    
    // Initialize plugin management controller if customPluginLoader is provided
    if (customPluginLoader) {
      this.pluginManagementController = new PluginManagementController(customPluginLoader);
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
    this.router.post('/chat/stream', (req, res) => this.chatController.handleChat(req, res)); // SSE streaming endpoint
    this.router.get('/chat/conversations', (req, res) => this.chatController.listConversations(req, res));
    this.router.get('/chat/conversations/:id', (req, res) => this.chatController.getConversation(req, res));
    this.router.delete('/chat/conversations/:id', (req, res) => this.chatController.deleteConversation(req, res));

    // Tool endpoints
    this.router.get('/tools', (req, res) => this.toolController.listTools(req, res));
    this.router.get('/tools/:id', (req, res) => this.toolController.getTool(req, res));
    this.router.post('/tools/:id/execute', (req, res) => this.toolController.executeTool(req, res));
    this.router.post('/tools/register', (req, res) => this.toolController.registerTool(req, res));
    this.router.delete('/tools/:id', (req, res) => this.toolController.unregisterTool(req, res));

    // Data source endpoints
    this.router.get('/data-sources', (req, res) => this.dataSourceController.listDataSources(req, res));
    this.router.get('/data-sources/available', (req, res) => this.dataSourceController.getAvailableDataSources(req, res));
    this.router.get('/data-sources/search', (req, res) => this.dataSourceController.searchDataSources(req, res));
    this.router.get('/data-sources/:id', (req, res) => this.dataSourceController.getDataSource(req, res));
    this.router.get('/data-sources/:id/schema', (req, res) => this.dataSourceController.getDataSourceSchema(req, res));
    this.router.get('/data-sources/:id/service-url', (req, res) => this.dataSourceController.getServiceUrl(req, res));
    this.router.post('/data-sources', (req, res) => this.dataSourceController.registerDataSource(req, res));
    this.router.post('/data-sources/postgis', (req, res) => this.dataSourceController.registerPostGISConnection(req, res));
    this.router.put('/data-sources/:id/metadata', (req, res) => this.dataSourceController.updateMetadata(req, res));
    this.router.delete('/data-sources/:id', (req, res) => this.dataSourceController.deleteDataSource(req, res));

    // File upload endpoints
    this.router.post('/upload/single', handleMultipartEncoding, upload.single('file'), (req, res) => this.fileUploadController.uploadSingleFile(req, res));
    this.router.post('/upload/multiple', handleMultipartEncoding, upload.array('files', 50), (req, res) => this.fileUploadController.uploadMultipleFiles(req, res));

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

    // MVT service endpoints (on-demand tile generation via strategy pattern)
    this.router.get('/services/mvt', (req, res) => this.mvtServiceController.listTilesets(req, res));
    this.router.get('/services/mvt/:tilesetId/metadata', (req, res) => this.mvtServiceController.getMetadata(req, res));
    this.router.get('/services/mvt/:tilesetId/:z/:x/:y.pbf', (req, res) => this.mvtServiceController.serveTile(req, res));
    this.router.delete('/services/mvt/:tilesetId', (req, res) => this.mvtServiceController.deleteTileset(req, res));

    // MVT on-demand publisher endpoints (on-demand tile generation)
    this.router.post('/mvt-dynamic/publish', (req, res) => this.mvtOnDemandController.publish(req, res));
    this.router.get('/mvt-dynamic/list', (req, res) => this.mvtOnDemandController.listTilesets(req, res));
    this.router.get('/mvt-dynamic/:tilesetId/metadata', (req, res) => this.mvtOnDemandController.getMetadata(req, res));
    this.router.get('/mvt-dynamic/:tilesetId/:z/:x/:y.pbf', (req, res) => this.mvtOnDemandController.getTile(req, res));
    this.router.delete('/mvt-dynamic/:tilesetId', (req, res) => this.mvtOnDemandController.deleteTileset(req, res));

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
    
    // Generic file serving for direct access to result files
    // Handles: /api/results/reports/*.html, /api/results/geojson/*.geojson, etc.
    this.router.get('/results/:subdir/:filename', (req, res) => this.resultController.serveGenericFile(req, res));

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
