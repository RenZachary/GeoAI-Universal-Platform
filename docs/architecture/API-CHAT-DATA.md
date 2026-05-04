# API接口规范 - 对话与数据源接口

## 1. API概述

### 1.1 基础信息

- **Base URL**: `http://localhost:3000/api`
- **协议**: HTTP/HTTPS
- **数据格式**: JSON
- **字符编码**: UTF-8
- **认证方式**: 无需认证（平台不涉及用户管理）

### 1.2 通用响应格式

#### 成功响应

```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

#### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": "详细错误信息（开发模式）",
    "suggestion": "解决建议",
    "timestamp": "2026-05-03T10:00:00Z"
  }
}
```

### 1.3 通用HTTP状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 204 | 删除成功（无内容返回） |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 422 | 验证失败 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

### 1.4 国际化支持

所有API支持中英文响应，通过以下方式指定语言：

- **Header**: `Accept-Language: zh-CN` 或 `Accept-Language: en-US`
- **Query参数**: `?lang=zh-CN` 或 `?lang=en-US`
- **默认**: 系统配置的语言

---

## 2. 对话接口 (Chat API)

### 2.1 发送消息（流式响应）

**端点**: `POST /api/chat/send`

**描述**: 发送自然语言消息，接收流式响应（SSE）

**请求头**:
```
Content-Type: application/json
Accept: text/event-stream
Accept-Language: zh-CN
```

**请求体**:
```json
{
  "message": "请显示小区数据，并创建河流的500米缓冲区",
  "conversationId": "conv_123",
  "language": "zh-CN"
}
```

**响应**: Server-Sent Events (SSE)

详见 [CORE-TYPES-AND-FLOWS.md](./CORE-TYPES-AND-FLOWS.md) 中的ChatStreamChunk定义。

**SSE事件类型**:

| 事件类型 | 说明 |
|---------|------|
| text | 文本输出 |
| task_start | 任务开始 |
| task_complete | 任务完成 |
| step_start | 步骤开始 |
| step_complete | 步骤完成 |
| progress | 进度更新 |
| visualization | 可视化结果 |
| report | 报告生成 |
| error | 错误信息 |
| complete | 对话完成 |

---

### 2.2 获取对话列表

**端点**: `GET /api/chat/conversations`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| page | number | 否 | 页码 | 1 |
| limit | number | 否 | 每页数量 | 20 |
| sort | string | 否 | 排序字段 | updated_at |
| order | string | 否 | 排序方向 | desc |

**响应**:
```json
{
  "success": true,
  "data": {
    "conversations": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 45,
      "totalPages": 5
    }
  }
}
```

---

### 2.3 获取单个对话详情

**端点**: `GET /api/chat/conversations/:id`

**响应**: 包含对话、消息、任务的完整信息

---

### 2.4 删除对话

**端点**: `DELETE /api/chat/conversations/:id`

**状态码**: 204 (删除成功)

---

## 3. 数据源接口 (Data Source API)

### 3.1 上传本地数据源

**端点**: `POST /api/data/upload`

**请求头**: `Content-Type: multipart/form-data`

**表单字段**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| files | File[] | 是 | 文件数组（Shapefile需上传.shp、.shx、.dbf等所有文件） |
| name | string | 否 | 数据源名称 |
| type | string | 是 | 数据类型：shapefile/geojson/tif |

**Shapefile多文件上传说明**:

用户上传Shapefile时，必须同时上传所有相关文件：
- `.shp` (必需) - 几何数据
- `.shx` (必需) - 索引文件
- `.dbf` (必需) - 属性数据
- `.prj` (可选) - 投影信息
- `.cpg` (可选) - 编码信息

后端会验证文件完整性，确保所有必需文件都存在且文件名一致。

**验证规则**:

- Shapefile: 必须包含.shp、.shx、.dbf文件
- GeoJSON: 必须是有效的GeoJSON格式
- TIFF: 必须是有效的GeoTIFF格式
- 单文件大小限制: 100MB
- 总文件大小限制: 500MB

---

### 3.2 获取数据源列表

**端点**: `GET /api/data/sources`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 数据源类型过滤 |
| page | number | 否 | 页码 |
| limit | number | 否 | 每页数量 |

---

### 3.3 获取数据源详情

**端点**: `GET /api/data/sources/:id`

---

### 3.4 删除数据源

**端点**: `DELETE /api/data/sources/:id`

**注意**: 
- 本地文件会被物理删除
- PostGIS数据源仅删除配置，不删除数据库表

---

### 3.5 预览数据源

**端点**: `GET /api/data/sources/:id/preview`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| limit | number | 否 | 预览要素数量 | 100 |

**响应**: GeoJSON FeatureCollection（前100个要素）

---

### 3.6 PostGIS数据源管理

#### 添加PostGIS数据源

**端点**: `POST /api/data/postgis`

**请求体**:
```json
{
  "name": "Production GIS Database",
  "host": "localhost",
  "port": 5432,
  "database": "gis_db",
  "schema": "public",
  "username": "gis_user",
  "password": "encrypted_password"
}
```

#### 更新PostGIS数据源

**端点**: `PUT /api/data/postgis/:id`

#### 删除PostGIS数据源

**端点**: `DELETE /api/data/postgis/:id`

#### 测试PostGIS连接

**端点**: `POST /api/data/postgis/:id/test`

**响应**:
```json
{
  "success": true,
  "data": {
    "connected": true,
    "version": "PostgreSQL 14.0, PostGIS 3.2",
    "responseTime": 45
  }
}
```

---

## 4. 文档索引

本系列文档已拆分为：

1. [API-CHAT-DATA.md](./API-CHAT-DATA.md) - 对话与数据源接口（本文档）
2. [API-PLUGIN-LLM.md](./API-PLUGIN-LLM.md) - 插件与LLM配置接口
3. [API-VISUALIZATION.md](./API-VISUALIZATION.md) - 可视化接口
4. [API-ERROR-CODES.md](./API-ERROR-CODES.md) - 错误码与通用规范

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
