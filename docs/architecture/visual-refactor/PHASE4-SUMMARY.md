# Phase 4: 支撑系统设计概览

## 📋 概述

本文档简要说明Phase 4需要完成的三个支撑系统重构。详细设计请参考各专项文档（待编写）。

---

## 🎨 09-StyleFactory重构

### 当前问题
- Executor中包含颜色解析逻辑（违反单一职责）
- 样式生成代码分散
- 不支持统一的错误处理

### 重构目标
```typescript
class StyleFactory {
  private colorEngine: ColorResolutionEngine;
  
  // 新方法签名
  async generateUniformStyle(config: UniformStyleConfig): Promise<string>;
  async generateCategoricalStyle(config: CategoricalStyleConfig): Promise<string>;
  async generateChoroplethStyle(config: ChoroplethStyleConfig): Promise<string>;
  
  // 统一保存逻辑
  private saveStyleJson(tilesetId: string, styleJson: any): string;
}
```

### 关键改动
1. **移除Executor中的颜色解析** → 委托给ColorEngine
2. **统一样式保存路径** → `workspace/results/styles/{tilesetId}.json`
3. **添加错误处理** → 统一的try-catch和日志

---

## 🌈 10-Color Resolution Engine

### 职责
集中管理所有颜色解析逻辑

### 核心方法
```typescript
class ColorResolutionEngine {
  // 解析单个颜色
  async resolveColor(color: string): Promise<string>;
  
  // 解析colorRamp为颜色数组
  async resolveColorRamp(rampName: string, numColors: number): Promise<string[]>;
  
  // 解析配色方案
  async resolveColorScheme(schemeName: string, count: number): Promise<string[]>;
}
```

### 配置管理
```typescript
const colorConfig = {
  // 中文颜色词映射
  zh: {
    '红色': 'reds',
    '绿色': 'greens',
    '蓝色': 'blues'
  },
  
  // 预定义色板
  ramps: {
    reds: ['#fff5f0', '#fee0d2', ..., '#99000d'],
    greens: ['#f7fcf5', '#e5f5e0', ..., '#005a32'],
    // ... 8种色板
  },
  
  // CSS颜色名称
  cssColors: {
    'red': '#ff0000',
    'green': '#00ff00',
    // ...
  }
};
```

### 优势
- ✅ 颜色逻辑集中管理
- ✅ 易于扩展新色板
- ✅ 支持多语言颜色词
- ✅ Executor无需关心颜色细节

---

## 📐 11-Geometry Adapter Layer

### 职责
自动检测几何类型并适配样式

### 核心方法
```typescript
class GeometryAdapter {
  // 检测GeoJSON的主导几何类型
  static detectGeometryType(geojson: FeatureCollection): GeometryType;
  
  // 获取对应的Mapbox layer type
  static getMapboxLayerType(geometryType: GeometryType): 'circle' | 'line' | 'fill';
  
  // 处理Mixed Geometry Collections
  static handleMixedGeometries(geojson: FeatureCollection): FeatureCollection[];
}
```

### 几何类型映射
```typescript
const geometryMapping = {
  'Point': 'circle',
  'MultiPoint': 'circle',
  'LineString': 'line',
  'MultiLineString': 'line',
  'Polygon': 'fill',
  'MultiPolygon': 'fill'
};
```

### 在Executor中使用
```typescript
// BaseRendererExecutor中自动检测
const geometryType = GeometryAdapter.detectGeometryType(geojson);
nativeData.metadata.geometryType = geometryType;

// StyleFactory中自动适配
const layerType = GeometryAdapter.getMapboxLayerType(geometryType);
```

---

## 📝 实施顺序

1. **先实现ColorEngine** - 其他组件依赖它
2. **再实现GeometryAdapter** - 独立工具类
3. **最后重构StyleFactory** - 依赖前两者

---

**文档版本：** v0.1 (Summary)  
**状态：** Detailed docs pending
