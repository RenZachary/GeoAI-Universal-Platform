# API接口规范 - 插件与LLM配置接口

## 1. 插件接口 (Plugin API)

### 1.1 上传自定义插件

**端点**: `POST /api/plugins/upload`

**请求头**: `Content-Type: multipart/form-data`

**表单字段**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| plugin | File | 是 | 插件文件（.zip或.js） |

**验证规则**:

- 文件大小限制: 50MB
- 必须包含有效的插件接口实现
- 版本号必须符合语义化版本规范

---

### 1.2 获取插件列表

**端点**: `GET /api/plugins`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| category | string | 否 | 插件分类过滤 |
| status | string | 否 | 插件状态过滤 |
| type | string | 否 | builtin/custom |

---

### 1.3 获取插件详情

**端点**: `GET /api/plugins/:id`

---

### 1.4 启动插件

**端点**: `POST /api/plugins/:id/start`

---

### 1.5 停用插件

**端点**: `POST /api/plugins/:id/stop`

---

### 1.6 删除插件

**端点**: `DELETE /api/plugins/:id`

**注意**: 不能删除内置插件

---

## 2. LLM配置接口 (LLM Configuration API)

### 2.1 获取支持的模型列表

**端点**: `GET /api/llm/models`

**响应**:
```json
{
  "success": true,
  "data": {
    "models": [
      {
        "type": "qwen",
        "name": "Qwen",
        "provider": "Alibaba",
        "versions": ["qwen-turbo", "qwen-plus", "qwen-max"]
      }
    ]
  }
}
```

---

### 2.2 获取当前LLM配置

**端点**: `GET /api/llm/config`

**注意**: API密钥不会在响应中返回

---

### 2.3 更新LLM配置

**端点**: `PUT /api/llm/config`

**请求体**:
```json
{
  "modelType": "qwen",
  "modelName": "qwen-plus",
  "config": {
    "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "apiKey": "sk-your-api-key",
    "temperature": 0.7,
    "maxTokens": 2000,
    "timeout": 30000
  },
  "activate": true
}
```

**验证规则**:

- baseUrl必须是有效的URL
- apiKey不能为空
- temperature范围: 0-1
- maxTokens范围: 1-8192
- timeout范围: 1000-60000毫秒

---

### 2.4 提示词模板管理

**说明**: 提示词模板存储在外部文件中（`llm/prompts/{language}/`），不嵌入代码。

#### 获取提示词模板列表

**端点**: `GET /api/llm/prompts`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | string | 否 | 模板分类 |
| language | string | 否 | 语言，默认 en-US |

**响应**:
```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": "requirement-parsing",
        "name": "Requirement Parsing Template",
        "language": "en-US",
        "category": "requirement_parsing",
        "variables": ["userInput", "context"],
        "filePath": "llm/prompts/en-US/requirement-parsing.md",
        "updatedAt": "2026-05-03T10:00:00Z"
      }
    ]
  }
}
```

#### 获取单个提示词模板内容

**端点**: `GET /api/llm/prompts/:id`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| language | string | 否 | 语言 | en-US |

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "requirement-parsing",
    "content": "You are a geographic information analysis assistant...",
    "language": "en-US",
    "variables": ["userInput", "context"]
  }
}
```

#### 创建/更新提示词模板

**端点**: `PUT /api/llm/prompts/:id`

**请求体**:
```json
{
  "content": "You are a geographic information AI assistant...",
  "language": "en-US",
  "category": "intent_detection",
  "variables": ["user_input"]
}
```

**说明**:
- 如果模板不存在则创建新文件
- 如果存在则覆盖文件内容
- 自动提取 content 中的 `{{variable}}` 占位符
- 文件保存在 `llm/prompts/{language}/{id}.md`

#### 删除提示词模板

**端点**: `DELETE /api/llm/prompts/:id`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| language | string | 否 | 语言，默认 en-US |

**注意**: 
- 不能删除系统必需的模板（如 system-prompt）
- 删除操作会物理删除文件

---

## 3. 文档索引

本系列文档已拆分为：

1. [API-CHAT-DATA.md](./API-CHAT-DATA.md) - 对话与数据源接口
2. [API-PLUGIN-LLM.md](./API-PLUGIN-LLM.md) - 插件与LLM配置接口（本文档）
3. [API-VISUALIZATION.md](./API-VISUALIZATION.md) - 可视化接口
4. [API-ERROR-CODES.md](./API-ERROR-CODES.md) - 错误码与通用规范

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
