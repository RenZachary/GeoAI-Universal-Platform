# 地图绘制功能实现文档

**日期**: 2026-05-13  
**版本**: v1.0  
**状态**: ✅ 已完成

---

## 功能概述

实现了完整的地图绘制功能，支持用户在地图上绘制多边形、圆形和线要素，并将绘制的几何体作为空间上下文用于后续的空间查询。

---

## 架构设计

### 核心组件

#### 1. Map Store 状态扩展

**文件**: `web/src/stores/mapImpl/state.ts`

新增空间上下文追踪状态：

```typescript
interface SelectedFeature {
  datasetId: string
  featureId: string
  geometry: GeoJSON.Geometry
  properties: Record<string, any>
}

interface DrawnGeometry {
  id: string
  type: 'polygon' | 'circle' | 'line'
  geometry: GeoJSON.Geometry
  properties?: Record<string, any>
  createdAt: Date
}

interface MapState {
  // ... existing fields
  
  // Spatial context tracking
  viewportBbox: Ref<[number, number, number, number] | null>
  selectedFeature: Ref<SelectedFeature | null>
  drawnGeometries: Ref<DrawnGeometry[]>
}
```

#### 2. 视口BBox自动追踪

**文件**: `web/src/stores/mapImpl/map-core.ts`

在地图移动事件中自动更新视口边界框：

```typescript
function updateViewportBbox() {
  if (!state.mapInstance.value) return
  
  const bounds = state.mapInstance.value.getBounds()
  state.viewportBbox.value = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth()
  ]
}
```

#### 3. DrawingToolbar 组件

**文件**: `web/src/components/map/DrawingToolbar.vue`

提供绘制工具UI和交互逻辑：

**功能特性**:
- ✅ 多边形绘制（点击添加顶点，双击或点击起点闭合）
- ✅ 圆形绘制（点击设置圆心，拖动/点击设置半径）
- ✅ 线绘制（点击添加顶点，双击或点击起点闭合）
- ✅ 实时预览（绘制过程中显示临时几何体）
- ✅ 永久图层（绘制完成后创建独立图层）
- ✅ 清除所有绘制

**技术实现**:

1. **多边形绘制**:
   - 使用MapLibre click事件收集顶点
   - 动态更新临时GeoJSON源
   - 检测是否接近起点以闭合多边形
   - 双击完成绘制

2. **圆形绘制**:
   - 第一次点击设置圆心
   - 鼠标移动时实时计算半径并更新预览
   - 第二次点击确认半径
   - 使用Haversine公式计算距离
   - 生成64个顶点的近似圆形多边形

3. **线绘制**:
   - 类似多边形，但生成LineString几何体
   - 支持闭合线（点击起点）

4. **临时图层管理**:
   - 创建临时GeoJSON源和图层
   - 绘制完成后移除临时图层
   - 为每个绘制要素创建永久图层

---

## 数据流

```
用户操作 → DrawingToolbar 
           ↓
    绘制几何体 (GeoJSON)
           ↓
    注册到 mapStore.drawnGeometries
           ↓
    创建永久MapLibre图层
           ↓
    发送聊天消息时包含context
           ↓
    后端ContextExtractorNode处理
           ↓
    注册为虚拟数据源
           ↓
    后续空间查询使用
```

---

## API集成

### 前端发送空间上下文

当用户发送聊天消息时，自动包含当前空间上下文：

```typescript
// web/src/api/chat.ts (待实现)

async function sendChatMessage(message: string) {
  const mapStore = useMapStore()
  
  const payload = {
    role: 'user',
    content: message,
    context: {
      viewportBbox: mapStore.viewportBbox,
      selectedFeature: mapStore.selectedFeature,
      drawnGeometries: mapStore.drawnGeometries
    }
  }
  
  // Send via SSE...
}
```

### 后端接收和处理

后端通过ContextExtractorNode将空间上下文转换为虚拟数据源（已在架构设计中定义）。

---

## 使用示例

### 场景1: 绘制区域并查询

1. 用户点击"Draw Polygon"按钮
2. 在地图上点击多个点绘制多边形
3. 双击完成绘制
4. 输入："该范围内有多少个兴趣点？"
5. 系统自动使用绘制的多边形作为查询范围

### 场景2: 绘制圆形缓冲区

1. 用户点击"Draw Circle"按钮
2. 点击设置圆心
3. 拖动或点击设置半径
4. 输入："统计圆形区域内的人口"
5. 系统使用圆形几何体进行空间查询

### 场景3: 绘制路径分析

1. 用户点击"Draw Line"按钮
2. 绘制一条路径
3. 输入："计算这条线的长度"
4. 系统计算LineString的长度

---

## 样式配置

### 绘制中样式

- **颜色**: #409eff (Element Plus Primary Blue)
- **填充透明度**: 0.3
- **边框宽度**: 2px
- **线宽度**: 3px

### 完成后样式

- **颜色**: #67c23a (Element Plus Success Green)
- **填充透明度**: 0.4
- **边框宽度**: 2px
- **线宽度**: 3px

---

## 技术细节

### 1. 坐标转换

使用MapLibre的`project()`方法将地理坐标转换为屏幕像素坐标，用于检测是否接近起点：

```typescript
function isNearFirstPoint(current: [number, number], first: [number, number], map: any): boolean {
  const threshold = 15 // pixels
  const currentPoint = map.project(current)
  const firstPoint = map.project(first)
  
  const distance = Math.sqrt(
    Math.pow(currentPoint.x - firstPoint.x, 2) +
    Math.pow(currentPoint.y - firstPoint.y, 2)
  )
  
  return distance < threshold
}
```

### 2. 距离计算

使用Haversine公式计算两点间的大地距离：

```typescript
function calculateDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δφ = (coord2[1] - coord1[1]) * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}
```

### 3. 圆形几何体生成

基于圆心和半径生成64个顶点的多边形：

```typescript
function createCircleGeometry(center: [number, number], radiusMeters: number): GeoJSON.Polygon {
  const points = 64
  const earthRadius = 6378137 // WGS84 major axis in meters
  const lat = center[1] * Math.PI / 180
  const lon = center[0] * Math.PI / 180
  const radiusRad = radiusMeters / earthRadius

  const coordinates: [number, number][] = []

  for (let i = 0; i <= points; i++) {
    const bearing = (i / points) * 2 * Math.PI
    
    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(radiusRad) +
      Math.cos(lat) * Math.sin(radiusRad) * Math.cos(bearing)
    )
    
    const lon2 = lon + Math.atan2(
      Math.sin(bearing) * Math.sin(radiusRad) * Math.cos(lat),
      Math.cos(radiusRad) - Math.sin(lat) * Math.sin(lat2)
    )

    coordinates.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI])
  }

  return {
    type: 'Polygon',
    coordinates: [coordinates]
  }
}
```

---

## 性能优化

### 1. 图层管理

- 临时图层在绘制完成后立即移除
- 每个绘制要素使用独立的GeoJSON源
- 避免频繁的图层重绘

### 2. 事件监听器清理

使用cleanup函数确保在取消绘制或切换模式时正确移除事件监听器：

```typescript
currentDrawHandler = {
  mode: 'polygon',
  cleanup: () => {
    map.off('click', onClick)
    map.off('dblclick', onDoubleClick)
    removeTempLayer()
  }
}
```

---

## 已知限制

1. **不支持编辑**: 绘制完成后无法编辑几何体（需要重新绘制）
2. **不支持撤销**: 无法撤销单个顶点（只能清除所有绘制）
3. **无吸附功能**: 绘制时不会吸附到现有要素
4. **无面积/长度显示**: 绘制过程中不实时显示几何属性

---

## 未来扩展

### Phase 2: 增强功能

1. **要素编辑**:
   - 支持拖拽顶点
   - 支持添加/删除顶点
   - 支持整体移动

2. **测量工具**:
   - 实时显示面积/长度
   - 单位转换（平方米/平方公里/米/公里）

3. **高级绘制**:
   - 矩形绘制
   - 自由手绘
   - 导入GeoJSON

4. **样式自定义**:
   - 用户可选择颜色和透明度
   - 保存绘制样式偏好

### Phase 3: 空间分析集成

1. **选中要素支持**:
   - 点击要素高亮显示
   - 添加到selectedFeature状态
   - 支持多选

2. **上下文菜单**:
   - 右键绘制要素显示操作菜单
   - 快速执行常见空间查询

3. **历史管理**:
   - 保存绘制历史
   - 支持恢复之前的绘制
   - 跨会话持久化

---

## 测试清单

### 功能测试

- [x] 多边形绘制正常工作
- [x] 圆形绘制正常工作
- [x] 线绘制正常工作
- [x] 临时预览正确显示
- [x] 永久图层正确创建
- [x] 清除所有绘制正常工作
- [x] 取消绘制正常工作
- [x] 视口BBox自动更新

### 兼容性测试

- [x] TypeScript编译通过
- [x] Vite构建成功
- [x] 无运行时错误

### 性能测试

- [ ] 大量绘制要素时的性能（待测试）
- [ ] 大圆形（全球范围）的渲染性能（待测试）

---

## 总结

本次实现完成了完整的前端绘制功能，包括：

✅ **核心功能**:
- 多边形、圆形、线三种绘制模式
- 实时预览和永久图层
- 视口BBox自动追踪
- Map Store状态扩展

✅ **架构优势**:
- 模块化设计（DrawingToolbar独立组件）
- 类型安全（完整的TypeScript类型定义）
- 可扩展性（易于添加新的绘制类型）
- 与现有架构无缝集成

✅ **代码质量**:
- 无TypeScript编译错误
- 遵循Vue 3 Composition API最佳实践
- 清晰的事件管理和资源清理
- 完善的注释和文档

下一步需要实现后端ContextExtractorNode和SSE消息增强，以完成整个空间上下文感知查询的闭环。
