# API接口规范 - 可视化接口

## 1. 可视化接口 (Visualization API)

### 1.1 获取MVT瓦片

**端点**: `GET /api/visualization/mvt/:serviceId/:z/:x/:y`

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| serviceId | string | MVT服务ID |
| z | number | 缩放级别 (0-18) |
| x | number | 瓦片X坐标 |
| y | number | 瓦片Y坐标 |

**响应**:
- **Content-Type**: `application/x-protobuf`
- **Body**: 二进制PBF格式瓦片数据

**缓存**: 浏览器缓存24小时

---

### 1.2 获取WMS地图

**端点**: `GET /api/visualization/wms/:serviceId`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| width | number | 是 | 图片宽度（像素） |
| height | number | 是 | 图片高度（像素） |
| bbox | string | 是 | 边界框: minX,minY,maxX,maxY |
| crs | string | 否 | 坐标系，默认EPSG:4326 |
| format | string | 否 | png/jpeg，默认png |

**响应**:
- **Content-Type**: `image/png` 或 `image/jpeg`
- **Body**: 二进制图片数据

---

### 1.3 获取热力图数据

**端点**: `GET /api/visualization/heatmap/:dataId`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| radius | number | 否 | 热力半径（米） | 500 |
| intensityField | string | 否 | 强度字段 | 无 |

**响应**: GeoJSON FeatureCollection

---

### 1.4 发布MVT服务

**端点**: `POST /api/visualization/publish/mvt`

**请求体**:
```json
{
  "dataSourceId": "ds_001",
  "minZoom": 0,
  "maxZoom": 18
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "serviceId": "mvt_svc_001",
    "type": "mvt",
    "bbox": [116.3, 39.9, 116.5, 40.1],
    "minZoom": 0,
    "maxZoom": 18,
    "tileUrlTemplate": "/api/visualization/mvt/mvt_svc_001/{z}/{x}/{y}"
  }
}
```

---

### 1.5 发布WMS服务

**端点**: `POST /api/visualization/publish/wms`

**请求体**:
```json
{
  "dataSourceId": "ds_002"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "serviceId": "wms_svc_001",
    "type": "wms",
    "bbox": [116.3, 39.9, 116.5, 40.1],
    "crs": "EPSG:4326",
    "imageUrlTemplate": "/api/visualization/wms/wms_svc_001?width={width}&height={height}&bbox={bbox}"
  }
}
```

---

### 1.6 获取服务列表

**端点**: `GET /api/visualization/services`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 服务类型过滤：mvt/wms |
| status | string | 否 | 状态过滤：active/expired |

**响应**:
```json
{
  "success": true,
  "data": {
    "services": [
      {
        "serviceId": "mvt_svc_001",
        "type": "mvt",
        "dataSourceId": "ds_001",
        "status": "active",
        "createdAt": "2026-05-03T10:00:00Z",
        "expiresAt": "2026-05-04T10:00:00Z"
      }
    ]
  }
}
```

---

### 1.7 删除服务

**端点**: `DELETE /api/visualization/services/:serviceId`

**说明**: 
- 删除服务元信息
- 清理相关缓存（MVT瓦片缓存等）
- 释放资源

---

## 2. 服务发布规范

### 2.1 矢量数据 → MVT服务

- **适用**: Shapefile, GeoJSON, PostGIS矢量数据
- **优势**: 瓦片化，前端加载快，支持缩放
- **TTL**: 24小时自动过期

### 2.2 影像数据 → WMS服务

- **适用**: TIF栅格数据
- **优势**: 按需渲染，支持多种投影
- **TTL**: 24小时自动过期

### 2.3 热力图 → GeoJSON

- **适用**: 点数据密度可视化
- **优势**: 前端直接渲染，无需服务端瓦片
- **不发布服务**: 直接返回GeoJSON数据

---

## 3. 文档索引

本系列文档已拆分为：

1. [API-CHAT-DATA.md](./API-CHAT-DATA.md) - 对话与数据源接口
2. [API-PLUGIN-LLM.md](./API-PLUGIN-LLM.md) - 插件与LLM配置接口
3. [API-VISUALIZATION.md](./API-VISUALIZATION.md) - 可视化接口（本文档）
4. [API-ERROR-CODES.md](./API-ERROR-CODES.md) - 错误码与通用规范

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03
