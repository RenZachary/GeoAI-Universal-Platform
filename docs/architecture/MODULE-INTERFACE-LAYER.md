# 接口层详细设计

## 1. 模块职责

- 接收HTTP请求，进行参数验证和权限检查
- 调用下层服务处理业务逻辑
- 返回标准化响应（支持流式输出）
- 统一错误处理和国际化应答

---

## 2. 控制器设计

### 2.1 ChatController（对话控制器）

```typescript
class ChatController {
  /**
   * 发送对话消息（流式响应）
   */
  async sendMessage(req: Request, res: Response): Promise<void>;
  
  /**
   * 获取历史对话列表
   */
  async getConversations(req: Request, res: Response): Promise<Response>;
  
  /**
   * 获取单个对话详情
   */
  async getConversation(req: Request, res: Response): Promise<Response>;
  
  /**
   * 删除对话
   */
  async deleteConversation(req: Request, res: Response): Promise<Response>;
}
```

**请求/响应示例**:

```typescript
// POST /api/chat/send
interface SendMessageRequest {
  message: string;
  conversationId?: string;  // 可选，继续对话
  language?: 'zh-CN' | 'en-US';
}

// SSE Stream Response
interface ChatStreamChunk {
  type: 'text' | 'task_start' | 'task_complete' | 'step_start' | 'step_complete' | 'error' | 'visualization' | 'report';
  content?: string;
  taskId?: string;
  stepId?: string;
  stepType?: 'load_data' | 'analyze' | 'transform' | 'visualize' | 'report';
  serviceId?: string;
  tileUrl?: string;
  imageUrl?: string;
  reportId?: string;
  downloadUrl?: string;
  error?: ErrorResponse;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
}
```

---

### 2.2 DataController（数据管理控制器）

```typescript
class DataController {
  /**
   * 上传本地数据源
   */
  async uploadData(req: Request, res: Response): Promise<Response>;
  
  /**
   * 获取数据源列表
   */
  async getDataSources(req: Request, res: Response): Promise<Response>;
  
  /**
   * 获取数据源详情
   */
  async getDataSource(req: Request, res: Response): Promise<Response>;
  
  /**
   * 删除数据源
   */
  async deleteDataSource(req: Request, res: Response): Promise<Response>;
  
  /**
   * 预览数据源
   */
  async previewDataSource(req: Request, res: Response): Promise<Response>;
  
  /**
   * 添加PostGIS数据源
   */
  async addPostGISDataSource(req: Request, res: Response): Promise<Response>;
  
  /**
   * 更新PostGIS数据源
   */
  async updatePostGISDataSource(req: Request, res: Response): Promise<Response>;
  
  /**
   * 删除PostGIS数据源
   */
  async deletePostGISDataSource(req: Request, res: Response): Promise<Response>;
  
  /**
   * 测试PostGIS连接
   */
  async testPostGISConnection(req: Request, res: Response): Promise<Response>;
}
```

---

### 2.3 PluginController（插件管理控制器）

```typescript
class PluginController {
  /**
   * 上传自定义插件
   */
  async uploadPlugin(req: Request, res: Response): Promise<Response>;
  
  /**
   * 获取插件列表
   */
  async getPlugins(req: Request, res: Response): Promise<Response>;
  
  /**
   * 获取插件详情
   */
  async getPlugin(req: Request, res: Response): Promise<Response>;
  
  /**
   * 启动插件
   */
  async startPlugin(req: Request, res: Response): Promise<Response>;
  
  /**
   * 停用插件
   */
  async stopPlugin(req: Request, res: Response): Promise<Response>;
  
  /**
   * 删除插件
   */
  async deletePlugin(req: Request, res: Response): Promise<Response>;
}
```

---

### 2.4 LLMController（LLM配置控制器）

```typescript
class LLMController {
  /**
   * 获取支持的LLM模型列表
   */
  async getModels(req: Request, res: Response): Promise<Response>;
  
  /**
   * 更新LLM配置
   */
  async updateConfig(req: Request, res: Response): Promise<Response>;
  
  /**
   * 获取当前LLM配置
   */
  async getConfig(req: Request, res: Response): Promise<Response>;
  
  /**
   * 获取提示词模板列表
   */
  async getPromptTemplates(req: Request, res: Response): Promise<Response>;
  
  /**
   * 创建提示词模板
   */
  async createPromptTemplate(req: Request, res: Response): Promise<Response>;
  
  /**
   * 更新提示词模板
   */
  async updatePromptTemplate(req: Request, res: Response): Promise<Response>;
  
  /**
   * 删除提示词模板
   */
  async deletePromptTemplate(req: Request, res: Response): Promise<Response>;
}
```

---

### 2.5 VisualizationController（可视化控制器）

```typescript
class VisualizationController {
  /**
   * 获取MVT瓦片
   */
  async getMVTTile(req: Request, res: Response): Promise<void>;
  
  /**
   * 获取WMS地图
   */
  async getWMSMap(req: Request, res: Response): Promise<void>;
  
  /**
   * 获取热力图数据
   */
  async getHeatmapData(req: Request, res: Response): Promise<Response>;
  
  /**
   * 发布MVT服务
   */
  async publishMVTService(req: Request, res: Response): Promise<Response>;
  
  /**
   * 发布WMS服务
   */
  async publishWMSService(req: Request, res: Response): Promise<Response>;
}
```

---

## 3. 中间件设计

### 3.1 ErrorHandler（错误处理中间件）

```typescript
class ErrorHandler {
  static handle(err: Error, req: Request, res: Response, next: NextFunction): void;
  
  private static formatError(err: Error, language: string): ErrorResponse;
  private static logError(err: Error, req: Request): void;
}
```

### 3.2 ValidationMiddleware（验证中间件）

```typescript
class ValidationMiddleware {
  static validate(schema: ZodSchema): RequestHandler;
  static validateFileUpload(options: UploadOptions): RequestHandler;
}
```

### 3.3 I18nMiddleware（国际化中间件）

```typescript
class I18nMiddleware {
  static detectLanguage(req: Request): string;
  static setResponseLanguage(res: Response, language: string): void;
}
```

---

## 4. 路由设计

```typescript
// chat.routes.ts
router.post('/send', ChatController.sendMessage);
router.get('/conversations', ChatController.getConversations);
router.get('/conversations/:id', ChatController.getConversation);
router.delete('/conversations/:id', ChatController.deleteConversation);

// data.routes.ts
router.post('/upload', multer().array('files'), DataController.uploadData);
router.get('/sources', DataController.getDataSources);
router.get('/sources/:id', DataController.getDataSource);
router.delete('/sources/:id', DataController.deleteDataSource);
router.post('/postgis', DataController.addPostGISDataSource);
router.put('/postgis/:id', DataController.updatePostGISDataSource);
router.delete('/postgis/:id', DataController.deletePostGISDataSource);
router.post('/postgis/:id/test', DataController.testPostGISConnection);

// plugin.routes.ts
router.post('/upload', multer().single('plugin'), PluginController.uploadPlugin);
router.get('/', PluginController.getPlugins);
router.get('/:id', PluginController.getPlugin);
router.post('/:id/start', PluginController.startPlugin);
router.post('/:id/stop', PluginController.stopPlugin);
router.delete('/:id', PluginController.deletePlugin);

// llm.routes.ts
router.get('/models', LLMController.getModels);
router.get('/config', LLMController.getConfig);
router.put('/config', LLMController.updateConfig);
router.get('/prompts', LLMController.getPromptTemplates);
router.post('/prompts', LLMController.createPromptTemplate);
router.put('/prompts/:id', LLMController.updatePromptTemplate);
router.delete('/prompts/:id', LLMController.deletePromptTemplate);

// visualization.routes.ts
router.get('/mvt/:serviceId/:z/:x/:y', VisualizationController.getMVTTile);
router.get('/wms/:serviceId', VisualizationController.getWMSMap);
router.get('/heatmap/:dataId', VisualizationController.getHeatmapData);
router.post('/publish/mvt', VisualizationController.publishMVTService);
router.post('/publish/wms', VisualizationController.publishWMSService);
```

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
