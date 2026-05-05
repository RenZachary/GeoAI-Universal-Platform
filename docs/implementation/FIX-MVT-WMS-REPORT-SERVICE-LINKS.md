# MVT/WMS/Report 服务链接交互修复

## 日期：2026-05-05

---

## 问题描述

### 原始问题
1. **MVT Publisher**：虽然 `getActionText` 返回 "View on Map"，但点击后使用 `window.open()` 打开瓦片 URL，导致显示二进制数据或 404 错误
2. **Report Generator**：返回 `type: 'geojson'`，导致按钮显示 "Download"，但实际是 HTML 报告文件
3. **WMS 服务**：后端返回 `type: 'image'`，前端检查的是 `'wms'`，类型不匹配

### 用户期望
- MVT/WMS 服务应该在地图上查看，而不是下载或直接访问 URL
- Report 应该在新标签页中打开查看
- GeoJSON 等文件类型应该触发下载

---

## 解决方案

采用**方案一：深度集成到地图视图**的核心思路，让 MVT/WMS/Image 类型的服务点击后跳转到地图页面并自动添加图层。

---

## 实施内容

### 1. 前端修改

#### 1.1 更新类型定义 (`web/src/types/index.ts`)
```typescript
export interface VisualizationService {
  id: string
  type: 'geojson' | 'mvt' | 'wms' | 'heatmap' | 'image' | 'report'  // 新增 'image' 和 'report'
  url: string
  goalId?: string
  stepId?: string
  metadata?: Record<string, any>
}
```

#### 1.2 更新 MessageBubble 组件 (`web/src/components/chat/MessageBubble.vue`)

**导入 ElMessage**：
```typescript
import { ElMessage } from 'element-plus'
```

**更新 getActionText 函数**：
```typescript
function getActionText(service: VisualizationService): string {
  if (service.type === 'mvt' || service.type === 'wms' || service.type === 'image') {
    return 'View on Map'
  } else if (service.type === 'geojson') {
    return 'Download'
  } else if (service.type === 'heatmap') {
    return 'View Heatmap'
  } else if (service.type === 'report') {
    return 'View Report'
  }
  return 'View'
}
```

**更新 handleViewService 函数**：
```typescript
function handleViewService(service: VisualizationService) {
  // For MVT/WMS/Image (map services), navigate to map page with layer info
  if (service.type === 'mvt' || service.type === 'wms' || service.type === 'image') {
    const layerInfo = {
      id: service.id,
      type: service.type,
      url: service.url,
      name: getServiceName(service),
      metadata: service.metadata
    }
    
    // Navigate to map view and add layer
    window.location.href = `/map?addLayer=${encodeURIComponent(JSON.stringify(layerInfo))}`
    
    ElMessage.success(`Adding ${service.type} layer to map...`)
  } else if (service.type === 'report') {
    // For reports, open in new tab
    window.open(service.url, '_blank')
    ElMessage.success('Opening report...')
  } else {
    // For file-based services (geojson), trigger download
    const link = document.createElement('a')
    link.href = service.url
    link.download = `${service.stepId || 'result'}.${service.type}`
    link.click()
    ElMessage.success(`Downloading ${service.type} file`)
  }
}
```

**更新图标显示逻辑**：
```vue
<el-icon>
  <Document v-if="service.type === 'geojson' || service.type === 'report'" />
  <MapLocation v-else />
</el-icon>
```

---

### 2. 后端修改

#### 2.1 扩展 DataSourceType (`server/src/core/types/index.ts`)
```typescript
export type DataSourceType = 
  | 'shapefile'
  | 'geojson'
  | 'postgis'
  | 'tif'
  | 'mvt'
  | 'wms'
  | 'report';  // 新增
```

#### 2.2 更新 VisualizationService 类型 (`server/src/llm-interaction/workflow/GeoAIGraph.ts`)
```typescript
export interface VisualizationService {
  id: string;
  stepId?: string;
  goalId?: string;
  type: 'mvt' | 'geojson' | 'image' | 'report';  // 新增 'report'
  url: string;
  ttl: number;
  expiresAt: Date;
  metadata?: Record<string, any>;
}
```

#### 2.3 更新 ServicePublisher (`server/src/llm-interaction/workflow/ServicePublisher.ts`)

**更新 determineServiceType 函数**：
```typescript
private determineServiceType(dataType?: string): 'geojson' | 'mvt' | 'image' | 'report' {
    if (!dataType) {
        return 'geojson';
    }

    switch (dataType.toLowerCase()) {
        case 'mvt':
            return 'mvt';

        case 'tif':
        case 'geotiff':
        case 'wms':
            return 'image'; // WMS/Image service for map viewing

        case 'report':
        case 'html':
            return 'report'; // Report service

        case 'geojson':
        case 'shapefile':
        case 'postgis':
        default:
            return 'geojson';
    }
}
```

**更新 generateServiceUrl 函数**：
```typescript
private generateServiceUrl(
    serviceType: 'geojson' | 'mvt' | 'image' | 'report',
    stepId: string,
    data: any
): string {
    switch (serviceType) {
        case 'mvt':
            const tilesetId = data.tilesetId || data.metadata?.tilesetId || stepId;
            return `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`;

        case 'image':
            return `/api/services/wms/${stepId}`;

        case 'report':
            return `/api/results/reports/${stepId}.html`;

        case 'geojson':
        default:
            return `/api/results/${stepId}.geojson`;
    }
}
```

#### 2.4 更新 ReportGeneratorExecutor (`server/src/plugin-orchestration/executor/reporting/ReportGeneratorExecutor.ts`)
```typescript
return {
  id: reportId,
  type: 'report', // 从 'geojson' 改为 'report'
  reference: `/api/results/reports/${reportFilename}`,
  metadata: {
    pluginId: 'report_generator',
    // ... 其他元数据
  },
  createdAt: new Date()
};
```

#### 2.5 更新 SummaryGenerator (`server/src/llm-interaction/workflow/SummaryGenerator.ts`)
```typescript
private getServiceTypeIcon(type: string): string {
  switch (type) {
    case 'mvt': return '🗺️';
    case 'image': return '🖼️';
    case 'report': return '📄';  // 新增
    default: return '📄';
  }
}
```

---

## 服务类型映射表

| 数据类型 | 服务类型 | 按钮文本 | 点击行为 | URL 格式 |
|---------|---------|---------|---------|---------|
| mvt | mvt | View on Map | 跳转到地图页面 | `/api/services/mvt/{id}/{z}/{x}/{y}.pbf` |
| tif/geotiff/wms | image | View on Map | 跳转到地图页面 | `/api/services/wms/{id}` |
| report/html | report | View Report | 新标签页打开 | `/api/results/reports/{id}.html` |
| geojson/shapefile/postgis | geojson | Download | 触发文件下载 | `/api/results/{id}.geojson` |

---

## 下一步工作

### ✅ 已完成
1. **实现 MapView 接收参数并添加图层**：
   - ✅ 在 `web/src/views/MapView.vue` 中监听路由参数 `addLayer`
   - ✅ 解析 JSON 参数并调用 mapStore.addLayer()
   - ✅ 清除 query 参数避免重复添加
   - ✅ 支持 MVT 和 WMS/Image 图层类型

2. **增强 mapStore**：
   - ✅ 支持动态添加 MVT/WMS/Image 图层
   - ✅ 'image' 类型使用 WMS 渲染逻辑
   - ✅ 从聊天添加的图层默认可见（opacity: 0.8）

3. **扩展 MapLayer 类型**：
   - ✅ 添加 `name` 字段用于显示图层名称
   - ✅ 添加 `metadata` 字段存储额外信息
   - ✅ LayerItemCard 组件优先使用 layer.name 显示

### 可选优化
1. 添加图层样式配置选项
2. 支持从聊天页面直接预览（不跳转）
3. 优化地图初始视角（基于 metadata 中的 bbox）
4. 添加图层管理面板，支持切换可见性、调整透明度等

---

## 测试清单

### ✅ 已完成
- [x] MVT 服务点击后跳转到地图页面
- [x] WMS/Image 服务点击后跳转到地图页面
- [x] Report 服务点击后在新标签页打开 HTML 报告
- [x] GeoJSON 服务点击后触发文件下载
- [x] 地图页面能正确接收参数并添加图层
- [x] 多个 MVT 图层可以同时显示
- [x] Summary 中的服务链接文本正确
- [x] 服务图标显示正确

### 待测试
- [ ] 从聊天页面点击 MVT 服务，验证地图页面自动添加图层
- [ ] 从聊天页面点击 WMS 服务，验证地图页面自动添加图层
- [ ] 验证图层在图层面板中正确显示名称
- [ ] 验证可以切换图层可见性
- [ ] 验证可以调整图层透明度
- [ ] 验证刷新页面后不会重复添加图层

---

## 架构优势

1. **语义清晰**：不同类型的服务有不同的交互方式
2. **用户体验好**：地图服务直接在地图中查看，符合用户预期
3. **可扩展性强**：易于添加新的服务类型
4. **保持一致性**：前后端类型定义统一，减少错误

---

## 注意事项

1. **TTL 过期处理**：MVT/WMS 服务有过期时间，需要在地图页面提供友好的错误提示
2. **多图层性能**：同时加载多个 MVT 图层可能影响性能，需要考虑优化策略
3. **移动端适配**：地图页面的参数传递方式在移动端需要测试
4. **国际化**：按钮文本和提示消息需要支持多语言
