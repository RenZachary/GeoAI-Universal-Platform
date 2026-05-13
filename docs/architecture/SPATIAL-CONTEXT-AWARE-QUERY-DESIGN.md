# 空间上下文感知查询架构设计

**日期**: 2026-05-13  
**作者**: GeoAI-UP 架构团队  
**版本**: v1.0

---

## 执行摘要

本文档阐述 GeoAI-UP 系统如何通过**统一抽象 + 虚拟数据源注册**的架构模式,实现对用户空间上下文的自然语言查询支持。

**核心设计理念**:
1. **统一抽象**: 将视口范围、选中要素、绘制几何体统一抽象为 `userMentionedFeatures`
2. **自动注册**: 将用户提到的空间对象转换为临时数据源,注册到 VirtualDataSourceManager
3. **流程复用**: 后续查询完全走现有标准流程(意图识别→目标拆分→算子执行)
4. **零侵入**: 不修改 IntentClassifier 和 GoalSplitter 的核心逻辑

**关键优势**:
- ✅ 避免代码重复:无需为每种上下文类型编写专门的处理逻辑
- ✅ 解耦设计:空间上下文捕获与业务逻辑完全分离
- ✅ 可扩展性:新增上下文类型只需扩展转换逻辑,无需修改工作流
- ✅ 充分利用现有基础设施:VirtualDataSourceManager、DataSourceRepository、PlaceholderResolver

---

## 一、问题本质分析

### 1.1 三类场景的共同点

| 场景 | 用户Query | 空间上下文 | 本质 |
|------|-----------|------------|------|
| **视图范围** | "当前视图范围内有多少个兴趣点？" | viewportBbox | 用户提到了一个矩形区域 |
| **选中要素** | "这个要素距离钟楼大概多少米？" | selectedFeature | 用户提到了一个具体要素 |
| **绘制区域** | "该范围内有多少人口？" | drawnGeometry | 用户提到了一个自定义几何体 |

**关键洞察**: 这三种场景的本质都是**用户在对话中引用了某个空间对象**,只是来源不同:
- 视口bbox → 系统自动生成的矩形
- 选中要素 → 用户点击的现有数据集中的要素
- 绘制几何体 → 用户手动绘制的临时几何体

### 1.2 架构设计的核心原则

**原则1: 统一抽象为 userMentionedFeatures**

```typescript
interface UserMentionedFeature {
  id: string;                    // 唯一标识,如 "viewport_bbox_123"
  type: 'viewport' | 'selection' | 'drawing';
  geometry: GeoJSON.Geometry;    // 统一的GeoJSON几何体
  properties?: Record<string, any>; // 附加属性(如选中要素的原始属性)
  sourceDatasetId?: string;      // 如果是选中要素,记录来源数据集
}
```

**原则2: 自动注册到虚拟数据源管理器**

将每个 `UserMentionedFeature` 转换为临时数据源并注册:

```typescript
// ContextExtractorNode 的职责
async function convertAndRegister(context: SpatialContext): Promise<string[]> {
  const features = convertToUserMentionedFeatures(context);
  const dataSourceIds: string[] = [];
  
  for (const feature of features) {
    // 创建临时GeoJSON文件
    const geojsonPath = await saveAsTempGeoJSON(feature);
    
    // 注册到 VirtualDataSourceManager
    const dsId = generateId();
    VirtualDataSourceManagerInstance.register({
      id: dsId,
      conversationId: state.conversationId,
      stepId: `context_${feature.type}`,
      data: {
        id: dsId,
        type: 'geojson',
        reference: geojsonPath,
        metadata: {
          name: feature.type === 'viewport' ? 'Current Viewport' : 
                feature.type === 'selection' ? 'Selected Feature' : 'Drawn Geometry',
          contextType: feature.type,
          originalFeature: feature
        }
      }
    });
    
    dataSourceIds.push(dsId);
  }
  
  return dataSourceIds;
}
```

**原则3: 利用现有数据访问层**

由于 `DataSourceRepository.getById()` 已经支持虚拟数据源查询(先查内存中的虚拟数据源,再查数据库),后续的算子执行**完全不需要修改**。

---

## 二、现有架构分析

### 2.1 虚拟数据源的现有使用方式

#### 2.1.1 注册时机

虚拟数据源在以下两个地方被自动注册:

1. **GeoAIGraph.ts - 插件执行后批量注册** (第335行):
```typescript
// 插件执行成功后,将所有 NativeData 结构的结果注册为虚拟数据源
for (const [stepId, analysisResult] of result.executionResults.entries()) {
  if (analysisResult.status === 'success' && analysisResult.data) {
    const hasNativeDataStructure = analysisResult.data.id && 
                                   analysisResult.data.type && 
                                   analysisResult.data.reference;
    
    if (hasNativeDataStructure) {
      VirtualDataSourceManagerInstance.register({
        id: analysisResult.data.id,
        conversationId: state.conversationId,
        stepId: stepId,
        data: analysisResult.data as any
      });
    }
  }
}
```

2. **EnhancedPluginExecutor.ts - 提前注册以支持跨步骤引用** (第212行):
```typescript
// 在执行新任务前,先将之前的成功结果注册为虚拟数据源
for (const [prevStepId, prevResult] of results.entries()) {
  if (prevResult.status === 'success' && prevResult.data?.id) {
    const existingSource = VirtualDataSourceManagerInstance.getById(prevResult.data.id);
    if (!existingSource) {
      VirtualDataSourceManagerInstance.register({
        id: prevResult.data.id,
        conversationId: state.conversationId,
        stepId: prevStepId,
        data: prevResult.data as any
      });
    }
  }
}
```

#### 2.1.2 查询机制

**DataSourceRepository.getById() 的统一查询逻辑** (第59-75行):

```typescript
getById(id: string): DataSourceRecord | null {
  // Step 1: 先查虚拟数据源(内存)
  const virtualDs = VirtualDataSourceManagerInstance.getById(id);
  
  if (virtualDs) {
    console.log(`[DataSourceRepository] Found virtual data source: ${id}`);
    return {
      id: virtualDs.id,
      name: virtualDs.name,
      type: virtualDs.type as any,
      reference: virtualDs.reference,
      metadata: virtualDs.nativeData.metadata || {},
      createdAt: virtualDs.createdAt,
      updatedAt: virtualDs.createdAt
    };
  }

  // Step 2: 再查数据库(持久化数据源)
  const row = this.db.prepare(`SELECT ... FROM data_sources WHERE id = ?`).get(id);
  // ... 返回数据库记录
}
```

**关键优势**: 所有算子通过 `DataSourceRepository.getById()` 查询数据时,**天然支持虚拟数据源**,无需任何特殊处理!

#### 2.1.3 占位符解析机制

**PlaceholderResolver.ts** 提供了智能的占位符解析:

```typescript
// LLM生成的执行计划中使用占位符
{
  stepId: "step_2",
  pluginId: "proximity_analysis",
  parameters: {
    sourceDataSourceId: "{step_1.result.id}",  // 引用上一步的结果
    targetDataSourceId: "poi_dataset_123",
    operation: "nearest_neighbor"
  }
}

// PlaceholderResolver 自动解析为实际的 NativeData.id
const resolvedParameters = resolvePlaceholders(step.parameters, executionResults);
// 解析后: { sourceDataSourceId: "result_step_1_xyz", ... }
```

**智能解析规则** (根据 returnType):
- **spatial**: `{step_id.result.id}` → 返回 NativeData.id (用于链式调用)
- **analytical**: `{step_id.result.data.fieldName}` → 返回统计结果字段
- **textual**: 终端操作,通常不被引用

### 2.2 为什么LLM不需要理解虚拟数据源

**关键洞察**: LLM只需要按照标准格式生成执行计划,使用占位符语法即可。系统会自动处理虚拟数据源的注册和解析。

**示例流程**:

```
用户: "缓冲区分析后,统计缓冲区内的POI数量"

LLM生成的执行计划:
[
  {
    stepId: "step_1",
    pluginId: "buffer_analysis",
    parameters: { dataSourceId: "roads_dataset", distance: 100 }
  },
  {
    stepId: "step_2",
    pluginId: "count_features",
    parameters: { 
      dataSourceId: "{step_1.result.id}",  // ← LLM使用占位符
      filter: { type: "poi" }
    }
  }
]

系统自动处理:
1. 执行 step_1 → 生成缓冲区结果 → 注册为虚拟数据源
2. 解析 step_2 的占位符 → 获取虚拟数据源的ID
3. 执行 step_2 → 通过 DataSourceRepository.getById() 查询虚拟数据源
4. 统计POI数量
```

**结论**: LLM完全不需要知道"虚拟数据源"的存在,它只需要使用标准的占位符语法。

---

## 三、架构设计方案

### 3.1 整体数据流

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Web)                          │
│                                                               │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ Map View │───▶│ Context      │───▶│ Chat Input       │  │
│  │          │    │ Capture      │    │ (with context)   │  │
│  └──────────┘    └──────────────┘    └──────────────────┘  │
│                           │                       │          │
│                           │  viewportBbox         │          │
│                           │  selectedFeature      │          │
│                           │  drawnGeometries      │          │
│                           ▼                       ▼          │
│                  ┌──────────────────────────────────────┐   │
│                  │  SSE Message with Context Field      │   │
│                  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Server)                          │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ContextExtractorNode (NEW)                          │  │
│  │                                                       │  │
│  │  1. Extract spatial context from message             │  │
│  │  2. Convert to UserMentionedFeatures                 │  │
│  │  3. Register as Virtual Data Sources                 │  │
│  │  4. Return virtualDataSourceIds                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  IntentClassifierNode (NO CHANGE)                    │  │
│  │  - Classifies intent based on query text             │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  GoalSplitterNode (NO CHANGE)                        │  │
│  │  - Generates execution plan with placeholders        │  │
│  │  - May reference virtualDataSourceIds if needed      │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  EnhancedPluginExecutor (NO CHANGE)                  │  │
│  │  - Resolves placeholders via PlaceholderResolver     │  │
│  │  - Queries data sources via DataSourceRepository     │  │
│  │  - Automatically supports virtual data sources       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 ContextExtractorNode 设计

#### 3.2.1 节点职责

**单一职责**: 将前端传来的空间上下文转换为虚拟数据源

**输入**:
```typescript
interface ContextExtractorInput {
  query: string;
  context?: {
    viewportBbox?: [number, number, number, number]; // [minX, minY, maxX, maxY]
    selectedFeature?: {
      datasetId: string;
      featureId: string;
      geometry: GeoJSON.Geometry;
      properties: Record<string, any>;
    };
    drawnGeometries?: Array<{
      type: 'polygon' | 'circle' | 'line';
      geometry: GeoJSON.Geometry;
      properties?: Record<string, any>;
    }>;
  };
  conversationId: string;
}
```

**输出**:
```typescript
interface ContextExtractorOutput {
  virtualDataSourceIds: string[];
  contextMetadata?: {
    hasViewport: boolean;
    hasSelection: boolean;
    hasDrawing: boolean;
  };
}
```

#### 3.2.2 实现逻辑

```typescript
export class ContextExtractorNode implements WorkflowNode {
  async execute(input: ContextExtractorInput): Promise<ContextExtractorOutput> {
    const { context, conversationId } = input;
    
    if (!context) {
      return { virtualDataSourceIds: [], contextMetadata: {} };
    }
    
    const virtualDataSourceIds: string[] = [];
    const features: UserMentionedFeature[] = [];
    
    // 1. 转换视口bbox为矩形几何体
    if (context.viewportBbox) {
      const bboxGeometry = bboxToPolygon(context.viewportBbox);
      features.push({
        id: `viewport_${Date.now()}`,
        type: 'viewport',
        geometry: bboxGeometry,
        properties: { description: 'Current map viewport' }
      });
    }
    
    // 2. 转换选中要素
    if (context.selectedFeature) {
      features.push({
        id: `selection_${Date.now()}`,
        type: 'selection',
        geometry: context.selectedFeature.geometry,
        properties: context.selectedFeature.properties,
        sourceDatasetId: context.selectedFeature.datasetId
      });
    }
    
    // 3. 转换绘制几何体
    if (context.drawnGeometries && context.drawnGeometries.length > 0) {
      context.drawnGeometries.forEach((drawn, index) => {
        features.push({
          id: `drawing_${index}_${Date.now()}`,
          type: 'drawing',
          geometry: drawn.geometry,
          properties: drawn.properties || { drawingType: drawn.type }
        });
      });
    }
    
    // 4. 注册为虚拟数据源
    for (const feature of features) {
      const dsId = await this.registerAsVirtualDataSource(feature, conversationId);
      virtualDataSourceIds.push(dsId);
    }
    
    console.log(`[ContextExtractor] Registered ${virtualDataSourceIds.length} virtual data sources`);
    
    return {
      virtualDataSourceIds,
      contextMetadata: {
        hasViewport: !!context.viewportBbox,
        hasSelection: !!context.selectedFeature,
        hasDrawing: !!(context.drawnGeometries?.length)
      }
    };
  }
  
  private async registerAsVirtualDataSource(
    feature: UserMentionedFeature,
    conversationId: string
  ): Promise<string> {
    // 创建临时GeoJSON文件
    const geojsonContent = {
      type: 'Feature',
      geometry: feature.geometry,
      properties: feature.properties
    };
    
    const tempDir = path.join(workspaceBase, 'temp', 'context');
    await fs.promises.mkdir(tempDir, { recursive: true });
    
    const fileName = `${feature.id}.geojson`;
    const filePath = path.join(tempDir, fileName);
    await fs.promises.writeFile(filePath, JSON.stringify(geojsonContent));
    
    // 注册到 VirtualDataSourceManager
    const dsId = feature.id;
    VirtualDataSourceManagerInstance.register({
      id: dsId,
      conversationId,
      stepId: `context_${feature.type}`,
      data: {
        id: dsId,
        type: 'geojson',
        reference: filePath,
        metadata: {
          name: this.getDescriptiveName(feature),
          contextType: feature.type,
          sourceDatasetId: feature.sourceDatasetId
        }
      }
    });
    
    return dsId;
  }
  
  private getDescriptiveName(feature: UserMentionedFeature): string {
    switch (feature.type) {
      case 'viewport':
        return 'Current Viewport';
      case 'selection':
        return 'Selected Feature';
      case 'drawing':
        return 'Drawn Geometry';
      default:
        return 'Context Feature';
    }
  }
}
```

### 3.3 前端增强设计

#### 3.3.1 Map Store 扩展

```typescript
// web/src/stores/map.ts

interface MapState {
  // ... existing fields
  
  // NEW: Spatial context tracking
  viewportBbox: Ref<[number, number, number, number] | null>;
  selectedFeature: Ref<{
    datasetId: string;
    featureId: string;
    geometry: GeoJSON.Geometry;
    properties: Record<string, any>;
  } | null>;
  drawnGeometries: Ref<Array<{
    type: 'polygon' | 'circle' | 'line';
    geometry: GeoJSON.Geometry;
    properties?: Record<string, any>;
  }>>;
}

export const useMapStore = defineStore('map', () => {
  // ... existing state
  
  const viewportBbox = ref<[number, number, number, number] | null>(null);
  const selectedFeature = ref<any>(null);
  const drawnGeometries = ref<any[]>([]);
  
  // Update viewport bbox on map move
  function updateViewportBbox() {
    if (mapInstance.value) {
      const bounds = mapInstance.value.getBounds();
      viewportBbox.value = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth()
      ];
    }
  }
  
  // Set selected feature on click
  function setSelectedFeature(feature: any) {
    selectedFeature.value = feature;
  }
  
  // Add drawn geometry
  function addDrawnGeometry(geometry: GeoJSON.Geometry, type: string) {
    drawnGeometries.value.push({
      type,
      geometry
    });
  }
  
  // Clear all context
  function clearSpatialContext() {
    selectedFeature.value = null;
    drawnGeometries.value = [];
    // Note: viewportBbox is updated automatically on map move
  }
  
  // Get current context for chat message
  function getSpatialContext() {
    return {
      viewportBbox: viewportBbox.value,
      selectedFeature: selectedFeature.value,
      drawnGeometries: drawnGeometries.value
    };
  }
  
  return {
    // ... existing exports
    viewportBbox,
    selectedFeature,
    drawnGeometries,
    updateViewportBbox,
    setSelectedFeature,
    addDrawnGeometry,
    clearSpatialContext,
    getSpatialContext
  };
});
```

#### 3.3.2 SSE消息增强

```typescript
// web/src/api/chat.ts

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  context?: {
    viewportBbox?: [number, number, number, number];
    selectedFeature?: any;
    drawnGeometries?: any[];
  };
}

async function sendChatMessage(message: string) {
  const mapStore = useMapStore();
  
  const payload: ChatMessage = {
    role: 'user',
    content: message,
    context: mapStore.getSpatialContext()
  };
  
  // Send via SSE
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  // Handle streaming response...
}
```

#### 3.3.3 绘制工具栏组件

```vue
<!-- web/src/components/map/DrawingToolbar.vue -->
<template>
  <div class="drawing-toolbar">
    <button @click="startDrawing('polygon')" :class="{ active: drawingMode === 'polygon' }">
      Draw Polygon
    </button>
    <button @click="startDrawing('circle')" :class="{ active: drawingMode === 'circle' }">
      Draw Circle
    </button>
    <button @click="startDrawing('line')" :class="{ active: drawingMode === 'line' }">
      Draw Line
    </button>
    <button @click="clearDrawings" v-if="drawnGeometries.length > 0">
      Clear Drawings
    </button>
  </div>
</template>

<script setup lang="ts">
import { useMapStore } from '@/stores/map';

const mapStore = useMapStore();
const drawingMode = ref<'polygon' | 'circle' | 'line' | null>(null);

function startDrawing(mode: 'polygon' | 'circle' | 'line') {
  drawingMode.value = mode;
  // Integrate with MapLibre draw controls or custom drawing logic
}

function onDrawComplete(geometry: GeoJSON.Geometry) {
  mapStore.addDrawnGeometry(geometry, drawingMode.value!);
  drawingMode.value = null;
}

function clearDrawings() {
  mapStore.drawnGeometries = [];
}
</script>
```

### 3.4 后端API增强

#### 3.4.1 Chat Endpoint 增强

```typescript
// server/src/api/routes/chat.ts

router.post('/chat', async (req, res) => {
  const { content, context, conversationId } = req.body;
  
  // Pass context to workflow
  const result = await geoaiGraph.invoke({
    query: content,
    context,  // NEW: Include spatial context
    conversationId,
    // ... other fields
  });
  
  // Stream response...
});
```

#### 3.4.2 GeoAIGraph 集成 ContextExtractorNode

```typescript
// server/src/llm-interaction/workflow/GeoAIGraph.ts

const workflow = new StateGraph<GeoAIStateType>({
  channels: {
    // ... existing channels
    virtualDataSourceIds: { reducer: (x, y) => y ?? x }
  }
})
.addNode('contextExtractor', async (state) => {
  const extractor = new ContextExtractorNode();
  return await extractor.execute({
    query: state.query,
    context: state.context,
    conversationId: state.conversationId
  });
})
.addEdge('__start__', 'contextExtractor')  // NEW: First node
.addNode('intentClassifier', ...)
.addEdge('contextExtractor', 'intentClassifier')  // NEW: Chain
// ... rest of the workflow
```

---

## 四、实施计划

### Phase 1: 基础架构 (8小时)

1. **前端Map Store扩展** (3小时)
   - 添加 viewportBbox, selectedFeature, drawnGeometries 状态
   - 实现 getSpatialContext() 方法
   - 更新地图事件监听器

2. **SSE消息增强** (2小时)
   - 扩展 ChatMessage 接口
   - 修改发送逻辑以包含 context

3. **ContextExtractorNode实现** (3小时)
   - 实现转换逻辑
   - 实现虚拟数据源注册
   - 单元测试

### Phase 2: 前端UI组件 (6小时)

4. **绘制工具栏** (4小时)
   - 创建 DrawingToolbar.vue 组件
   - 集成MapLibre绘制功能
   - 样式和交互优化

5. **选中要素管理** (2小时)
   - 增强 FeatureInfoPopup
   - 添加"选中此要素"按钮
   - 视觉反馈(高亮显示)

### Phase 3: 测试和优化 (4小时)

6. **端到端测试** (3小时)
   - 测试三个场景的完整流程
   - 验证虚拟数据源注册和查询
   - 性能测试

7. **文档和清理** (1小时)
   - 更新API文档
   - 代码注释完善

**总工时**: 18小时 (~2.5个工作日)

---

## 五、风险评估与缓解

### 风险1: 临时文件管理

**问题**: 大量临时GeoJSON文件可能占用磁盘空间

**缓解措施**:
- VirtualDataSourceManager.cleanup() 已在对话结束时清理
- 定期清理过期临时文件(cron job)
- 监控临时目录大小

### 风险2: 并发请求冲突

**问题**: 多个并发请求可能产生相同的临时文件名

**缓解措施**:
- 使用 UUID 作为文件名
- 基于 conversationId 隔离临时目录

### 风险3: 大数据量性能

**问题**: 大型绘制区域可能包含大量要素,查询缓慢

**缓解措施**:
- PostGIS GiST索引加速空间查询
- 限制最大绘制面积
- 异步查询 + 进度提示

---

## 六、成功标准

### 功能完整性

- [ ] 场景1: 视口范围内的POI计数正常工作
- [ ] 场景2: 选中要素的距离计算正常工作
- [ ] 场景3: 绘制区域内的统计查询正常工作

### 性能指标

- [ ] ContextExtractorNode 执行时间 < 100ms
- [ ] 虚拟数据源注册时间 < 50ms/个
- [ ] 端到端响应时间 < 3秒(简单查询)

### 代码质量

- [ ] 单元测试覆盖率 > 80%
- [ ] 无TypeScript编译错误
- [ ] ESLint检查通过

---

## 七、未来扩展方向

### 7.1 多轮对话中的上下文保持

当前设计中,每次消息都会携带最新的空间上下文。未来可以支持:
- 上下文历史栈(允许用户说"回到上一个视图")
- 上下文命名(允许用户说"在区域A内统计...")

### 7.2 复杂空间关系推理

结合知识图谱,支持更复杂的查询:
- "找出距离选中学校500米内的所有公园"
- "比较区域A和区域B的人口密度"

### 7.3 3D场景支持

扩展到3D地图场景:
- 视口frustum而非bbox
- 3D绘制体(立方体、圆柱体等)

---

## 八、总结

本架构设计通过**统一抽象 + 虚拟数据源注册**的方式,优雅地解决了空间上下文感知查询的问题。核心优势在于:

1. **极简设计**: 仅需新增 ContextExtractorNode 一个节点
2. **充分利用现有基础设施**: VirtualDataSourceManager、DataSourceRepository、PlaceholderResolver
3. **零侵入**: IntentClassifier 和 GoalSplitter 无需修改
4. **高度可扩展**: 新增上下文类型只需扩展转换逻辑

这种设计完全符合 GeoAI-UP 的架构哲学:**通过抽象和组合,而非分支和特例,来应对复杂性**。
