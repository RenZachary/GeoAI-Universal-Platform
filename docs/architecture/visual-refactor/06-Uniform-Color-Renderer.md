# Uniform Color Renderer 详细设计

## 📋 概述

**Uniform Color Renderer（统一颜色渲染器）** 是最基础的可视化渲染器，用于用单一颜色显示地理要素。

### 适用场景

- "红色显示五虎林河数据集"
- "用蓝色显示所有监测点"
- "绿色显示主要道路"
- "简单显示行政区划边界"

### 核心特点

- ✅ **最简单**：无需分类、无需统计
- ✅ **最快速**：直接应用颜色，无计算开销
- ✅ **最通用**：支持点、线、面所有几何类型
- ✅ **优先级最高**：当用户意图不明确时，作为fallback选项

---

## 🎯 Plugin定义

### Plugin ID与元数据

```typescript
export const UniformColorRendererPlugin: Plugin = {
  id: 'uniform_color_renderer',
  name: 'Uniform Color Renderer',
  version: '1.0.0',
  description: 'Display geographic features with a single uniform color. Suitable for simple visualization without classification or statistical analysis.',
  category: 'visualization',
  
  // Execution Category
  executionCategory: 'visualization',
  
  // Input Schema
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'data_reference',
      required: true,
      description: 'ID of the data source to visualize'
    },
    {
      name: 'color',
      type: 'string',
      required: false,
      defaultValue: '#409eff',
      description: 'Color for rendering (supports hex, color names, or predefined ramp names)',
      examples: ['#ff0000', 'red', 'reds', '#00ff00']
    },
    {
      name: 'strokeWidth',
      type: 'number',
      required: false,
      defaultValue: 2,
      description: 'Stroke width for line/polygon features (pixels)',
      validation: { min: 0.5, max: 20 }
    },
    {
      name: 'pointSize',
      type: 'number',
      required: false,
      defaultValue: 5,
      description: 'Point size for point features (pixels)',
      validation: { min: 1, max: 50 }
    },
    {
      name: 'opacity',
      type: 'number',
      required: false,
      defaultValue: 0.8,
      description: 'Opacity of the rendered features (0-1)',
      validation: { min: 0, max: 1 }
    },
    {
      name: 'layerName',
      type: 'string',
      required: false,
      defaultValue: 'uniform',
      description: 'Name of the MVT layer'
    }
  ],
  
  // Output Schema
  outputSchema: {
    type: 'native_data',
    description: 'MVT service with uniform color styling',
    outputFields: [
      {
        name: 'result',
        type: 'string',
        description: 'MVT tile service URL',
        example: '/api/services/mvt/uniform_123/{z}/{x}/{y}.pbf'
      },
      {
        name: 'styleUrl',
        type: 'string',
        description: 'Mapbox Style JSON URL',
        example: '/workspace/results/styles/uniform_123.json'
      },
      {
        name: 'rendererType',
        type: 'string',
        description: 'Renderer type identifier',
        example: 'uniform'
      },
      {
        name: 'color',
        type: 'string',
        description: 'Applied color (resolved hex value)',
        example: '#ff0000'
      }
    ]
  },
  
  // Capability Declaration
  capability: {
    executionCategory: 'visualization',
    inputRequirements: {
      supportedDataFormats: ['vector'],
      supportedGeometryTypes: [
        'Point', 'LineString', 'Polygon',
        'MultiPoint', 'MultiLineString', 'MultiPolygon'
      ],
      requiredFields: []
    },
    outputCapabilities: {
      outputType: 'mvt',
      isTerminalNode: true,
      supportsMultipleOutputs: false
    },
    scenarios: [
      'simple_display',
      'single_color_visualization',
      'basic_rendering',
      'feature_outlining'
    ],
    priority: 8  // High priority - simplest renderer
  },
  
  capabilities: ['uniform_coloring', 'mvt_publishing', 'geometry_agnostic'],
  isBuiltin: true,
  installedAt: new Date()
};
```

---

## 🔧 Executor实现

### UniformColorExecutor

```typescript
import { BaseRendererExecutor } from './BaseRendererExecutor';
import type { NativeData, DataSource } from '../../../core/types';

export interface UniformColorParams {
  dataSourceId: string;
  color?: string;              // hex, color name, or ramp name
  strokeWidth?: number;        // for lines/polygons
  pointSize?: number;          // for points
  opacity?: number;            // 0-1
  layerName?: string;
}

export class UniformColorExecutor extends BaseRendererExecutor {
  
  async execute(params: UniformColorParams): Promise<NativeData> {
    console.log('[UniformColorExecutor] Starting uniform color rendering...');
    console.log(`[UniformColorExecutor] Parameters:`, params);
    
    return this.executeBaseWorkflow(params, async (p, nativeData) => {
      // Delegate style generation to StyleFactory
      const styleUrl = await this.styleFactory.generateUniformStyle({
        tilesetId: p._tilesetId,  // Set by base workflow after MVT generation
        layerName: p.layerName || 'uniform',
        color: p.color || '#409eff',
        strokeWidth: p.strokeWidth,
        pointSize: p.pointSize,
        opacity: p.opacity || 0.8,
        geometryType: nativeData.metadata?.geometryType  // Auto-detected
      });
      
      console.log(`[UniformColorExecutor] Style generated: ${styleUrl}`);
      return styleUrl;
    });
  }
  
  protected validateParams(params: UniformColorParams, dataSource: DataSource): void {
    // Validate dataSourceId exists
    if (!params.dataSourceId) {
      throw new Error('dataSourceId is required');
    }
    
    // Validate color format (if provided)
    if (params.color && !this.isValidColor(params.color)) {
      throw new Error(`Invalid color format: ${params.color}. Use hex (#RRGGBB), color name, or predefined ramp name.`);
    }
    
    // Validate numeric ranges
    if (params.strokeWidth !== undefined && (params.strokeWidth < 0.5 || params.strokeWidth > 20)) {
      throw new Error('strokeWidth must be between 0.5 and 20');
    }
    
    if (params.pointSize !== undefined && (params.pointSize < 1 || params.pointSize > 50)) {
      throw new Error('pointSize must be between 1 and 50');
    }
    
    if (params.opacity !== undefined && (params.opacity < 0 || params.opacity > 1)) {
      throw new Error('opacity must be between 0 and 1');
    }
    
    console.log('[UniformColorExecutor] Parameter validation passed');
  }
  
  protected getRendererSpecificMetadata(params: UniformColorParams): any {
    return {
      rendererType: 'uniform',
      color: params.color || '#409eff',
      strokeWidth: params.strokeWidth || 2,
      pointSize: params.pointSize || 5,
      opacity: params.opacity || 0.8
    };
  }
  
  /**
   * Validate color format
   * Supports: hex (#RRGGBB), CSS color names, predefined ramp names
   */
  private isValidColor(color: string): boolean {
    // Hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return true;
    }
    
    // CSS color names (common ones)
    const cssColors = ['red', 'green', 'blue', 'yellow', 'orange', 'purple', 'black', 'white', 'gray'];
    if (cssColors.includes(color.toLowerCase())) {
      return true;
    }
    
    // Predefined ramp names
    const rampNames = ['reds', 'greens', 'blues', 'oranges', 'purples', 'viridis', 'plasma', 'green_to_red'];
    if (rampNames.includes(color.toLowerCase())) {
      return true;
    }
    
    return false;
  }
}
```

---

## 🎨 StyleFactory集成

### generateUniformStyle方法

```typescript
class StyleFactory {
  private colorEngine: ColorResolutionEngine;
  
  async generateUniformStyle(config: UniformStyleConfig): Promise<string> {
    console.log('[StyleFactory] Generating uniform color style...');
    console.log(`[StyleFactory] Config:`, config);
    
    // Step 1: Resolve color (delegate to ColorEngine)
    const resolvedColor = await this.colorEngine.resolveColor(config.color);
    console.log(`[StyleFactory] Resolved color: ${config.color} → ${resolvedColor}`);
    
    // Step 2: Determine Mapbox layer type based on geometry
    const layerType = GeometryAdapter.getMapboxLayerType(config.geometryType);
    console.log(`[StyleFactory] Geometry type: ${config.geometryType} → Layer type: ${layerType}`);
    
    // Step 3: Build Mapbox GL JS style JSON
    const styleJson = this.buildUniformStyleJson({
      ...config,
      color: resolvedColor,
      layerType
    });
    
    // Step 4: Save to filesystem
    const styleUrl = this.saveStyleJson(config.tilesetId, styleJson);
    console.log(`[StyleFactory] Style saved: ${styleUrl}`);
    
    return styleUrl;
  }
  
  private buildUniformStyleJson(config: UniformStyleConfigWithResolvedColor): any {
    const { tilesetId, layerName, color, layerType, opacity, geometryType } = config;
    
    const style: MapboxStyle = {
      version: 8,
      sources: {
        [tilesetId]: {
          type: 'vector',
          tiles: [`/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`],
          minzoom: config.minZoom || 0,
          maxzoom: config.maxZoom || 22
        }
      },
      layers: []
    };
    
    // Add appropriate layer based on geometry type
    if (layerType === 'circle') {
      // Point features
      style.layers.push({
        id: `${layerName}-points`,
        type: 'circle',
        source: tilesetId,
        'source-layer': 'default',
        paint: {
          'circle-color': color,
          'circle-radius': config.pointSize || 5,
          'circle-opacity': opacity || 0.8
        }
      });
    } else if (layerType === 'line') {
      // Line features
      style.layers.push({
        id: `${layerName}-lines`,
        type: 'line',
        source: tilesetId,
        'source-layer': 'default',
        paint: {
          'line-color': color,
          'line-width': config.strokeWidth || 2,
          'line-opacity': opacity || 0.8
        }
      });
    } else if (layerType === 'fill') {
      // Polygon features
      style.layers.push(
        {
          id: `${layerName}-fill`,
          type: 'fill',
          source: tilesetId,
          'source-layer': 'default',
          paint: {
            'fill-color': color,
            'fill-opacity': (opacity || 0.8) * 0.7  // Slightly more transparent for fills
          }
        },
        {
          id: `${layerName}-outline`,
          type: 'line',
          source: tilesetId,
          'source-layer': 'default',
          paint: {
            'line-color': color,
            'line-width': (config.strokeWidth || 2) * 0.5,
            'line-opacity': opacity || 0.8
          }
        }
      );
    }
    
    // Add metadata
    style.metadata = {
      rendererType: 'uniform',
      color,
      geometryType,
      generatedAt: new Date().toISOString()
    };
    
    return style;
  }
}
```

---

## 🧪 测试用例

### Test Case 1: 线状数据统一颜色

**输入：**
```json
{
  "dataSourceId": "wuhulin_river",
  "color": "reds",
  "strokeWidth": 3,
  "opacity": 0.9
}
```

**期望输出：**
- MVT service URL
- Style JSON with line layer using red color
- Metadata: `{ rendererType: 'uniform', color: '#cb181d', geometryType: 'LineString' }`

**验证点：**
- ✅ Color resolved from "reds" to actual hex
- ✅ Line layer created with correct stroke width
- ✅ Opacity applied correctly

---

### Test Case 2: 点状数据统一颜色

**输入：**
```json
{
  "dataSourceId": "monitoring_points",
  "color": "#00ff00",
  "pointSize": 8,
  "opacity": 1.0
}
```

**期望输出：**
- MVT service URL
- Style JSON with circle layer using green color
- Metadata: `{ rendererType: 'uniform', color: '#00ff00', geometryType: 'Point' }`

**验证点：**
- ✅ Hex color used directly
- ✅ Circle layer created with correct radius
- ✅ Full opacity applied

---

### Test Case 3: 面状数据统一颜色

**输入：**
```json
{
  "dataSourceId": "administrative_divisions",
  "color": "blues",
  "strokeWidth": 1,
  "opacity": 0.6
}
```

**期望输出：**
- MVT service URL
- Style JSON with fill + outline layers using blue color
- Metadata: `{ rendererType: 'uniform', color: '#4292c6', geometryType: 'Polygon' }`

**验证点：**
- ✅ Color resolved from "blues" to actual hex
- ✅ Both fill and outline layers created
- ✅ Fill opacity reduced for better visibility

---

### Test Case 4: 默认参数

**输入：**
```json
{
  "dataSourceId": "any_dataset"
}
```

**期望输出：**
- Uses default color: `#409eff` (Element UI blue)
- Uses default strokeWidth: 2
- Uses default pointSize: 5
- Uses default opacity: 0.8

**验证点：**
- ✅ All defaults applied correctly
- ✅ No errors with minimal input

---

## 📊 性能考虑

### 优点
- ✅ **零计算开销**：无统计、无分类
- ✅ **快速生成**：只需解析颜色 + 生成样式
- ✅ **缓存友好**：相同参数的请求可复用结果

### 限制
- ⚠️ **无信息量**：不传达数据属性信息
- ⚠️ **仅适合简单场景**：复杂分析需要其他renderer

---

## 🔗 与其他组件的交互

```
User Query: "红色显示五虎林河"
    ↓
Goal Splitter: { type: 'visualization', description: '...' }
    ↓
TaskPlanner:
  ├─ Stage 1: Filter by category → visualization renderers
  ├─ Stage 2: Check compatibility → uniform_color_renderer matches
  └─ Stage 3: LLM selects → uniform_color_renderer
    ↓
UniformColorExecutor:
  ├─ Load data source
  ├─ Validate parameters
  ├─ Generate MVT tiles (via MVTPublisher)
  ├─ Generate Style JSON (via StyleFactory)
  │   ├─ ColorEngine resolves "reds" → "#cb181d"
  │   ├─ GeometryAdapter detects "LineString"
  │   └─ Build line layer style
  └─ Return NativeData
    ↓
Frontend: Load MVT + Style → Render red river
```

---

## 📝 实施检查清单

- [ ] 创建UniformColorRendererPlugin定义
- [ ] 实现UniformColorExecutor类
- [ ] 扩展StyleFactory.generateUniformStyle方法
- [ ] 扩展ColorEngine支持颜色名称解析
- [ ] 扩展GeometryAdapter支持geometry type检测
- [ ] 编写单元测试（4个test cases）
- [ ] 编写集成测试（完整workflow）
- [ ] 更新Plugin Registry注册新plugin
- [ ] 更新Prompt Templates添加scenarios
- [ ] 前端测试：验证MVT + Style加载正常

---

**文档版本：** v1.0  
**最后更新：** 2026-05-05  
**状态：** Ready for Implementation
