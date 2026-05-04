# API接口规范 - 错误码与通用规范

## 1. 错误码规范

### 1.1 错误码列表

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| INVALID_REQUEST | 400 | 请求参数无效 |
| VALIDATION_ERROR | 422 | 数据验证失败 |
| NOT_FOUND | 404 | 资源不存在 |
| CONFLICT | 409 | 资源冲突 |
| LLM_CONFIG_ERROR | 500 | LLM配置错误 |
| LLM_CALL_FAILED | 500 | LLM调用失败 |
| PLUGIN_NOT_FOUND | 404 | 插件不存在 |
| PLUGIN_INIT_FAILED | 500 | 插件初始化失败 |
| PLUGIN_EXECUTION_FAILED | 500 | 插件执行失败 |
| DATA_SOURCE_ERROR | 500 | 数据源错误 |
| FILE_UPLOAD_ERROR | 500 | 文件上传失败 |
| INVALID_SHAPEFILE | 400 | Shapefile格式无效 |
| INVALID_GEOJSON | 400 | GeoJSON格式无效 |
| CONNECTION_FAILED | 500 | 数据库连接失败 |
| SERVICE_PUBLISH_FAILED | 500 | 服务发布失败 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

### 1.2 错误响应示例

```json
{
  "success": false,
  "error": {
    "code": "LLM_CALL_FAILED",
    "message": "LLM调用失败",
    "details": "Request timeout after 30000ms",
    "suggestion": "请检查网络连接或增加超时时间",
    "timestamp": "2026-05-03T10:00:00Z"
  }
}
```

---

## 2. API版本管理

### 2.1 版本策略

- **当前版本**: v1
- **URL前缀**: `/api/v1/` (可选，默认为v1)
- **向后兼容**: 小版本更新保持API兼容
- **废弃通知**: 废弃的API会在响应头中标注

### 2.2 版本标识

**响应头**:
```
X-API-Version: 1.0.0
X-API-Deprecated: false
```

**废弃API响应头**:
```
X-API-Version: 1.0.0
X-API-Deprecated: true
X-API-Sunset-Date: 2026-12-31
Link: </api/v2/new-endpoint>; rel="successor-version"
```

---

## 3. 速率限制

### 3.1 限流策略

- **对话接口**: 每分钟60次请求
- **数据上传**: 每分钟10次请求
- **其他接口**: 每分钟120次请求

### 3.2 限流响应头

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1651564800
```

### 3.3 超限响应

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "请求频率超出限制",
    "suggestion": "请稍后再试",
    "retryAfter": 30
  }
}
```

**状态码**: 429 Too Many Requests

---

## 4. CORS配置

### 4.1 允许的源

```typescript
const corsOptions = {
  origin: '*',  // 生产环境应限制具体域名
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
  exposedHeaders: ['X-API-Version', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  credentials: false,
  maxAge: 86400,  // 24小时
};
```

---

## 5. API文档生成

### 5.1 OpenAPI/Swagger规范

项目提供OpenAPI 3.0规范文档，可通过以下地址访问：

- **Swagger UI**: `http://localhost:3000/api-docs`
- **OpenAPI JSON**: `http://localhost:3000/api-docs.json`
- **OpenAPI YAML**: `http://localhost:3000/api-docs.yaml`

### 5.2 自动生成工具

使用`swagger-jsdoc`从代码注释生成API文档。

---

## 6. 文档索引

本系列文档已拆分为：

1. [API-CHAT-DATA.md](./API-CHAT-DATA.md) - 对话与数据源接口
2. [API-PLUGIN-LLM.md](./API-PLUGIN-LLM.md) - 插件与LLM配置接口
3. [API-VISUALIZATION.md](./API-VISUALIZATION.md) - 可视化接口
4. [API-ERROR-CODES.md](./API-ERROR-CODES.md) - 错误码与通用规范（本文档）

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
