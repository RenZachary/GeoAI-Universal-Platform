# Categorical Renderer 详细设计

## 📋 概述

**Categorical Renderer（分类渲染器）** 用于按类别字段对地理要素进行着色，适用于离散数据的可视化。

### 适用场景

- "按土地利用类型显示不同颜色"
- "用不同颜色显示道路等级"
- "按监测点类型着色"
- "按行政区划类型区分颜色"

### 核心特点

- ✅ **离散映射**：每个类别对应一个颜色
- ✅ **自动生成图例**：便于用户理解
- ✅ **支持自定义颜色**：可为特定类别指定颜色
- ✅ **几何类型无关**：支持点、线、面

---

## 🎯 Plugin定义

### Plugin ID与元数据

```typescript
export const CategoricalRendererPlugin: Plugin = {
  id: 'categorical_renderer',
  name: 'Categorical Renderer',
  version: '1.0.0',
  description: 'Visualize geographic features by categorical field with distinct colors for each category. Generates automatic legend.',
  category: 'visualization',
  
  executionCategory: 'visualization',
  
  inputSchema: [
    {
      name: 'dataSourceId',
      type: 'data_reference',
      required: true,
      description: 'ID of the data source to visualize'
    },
    {
      name: 'categoryField',
      type: 'string',
      required: true,
      description: 'Categorical field name for coloring (must be string type)',
      examples: ['land_use', 'road_type', 'admin_level']
    },
    {
      name: 'colorScheme',
      type: 'string',
      required: false,
      defaultValue: 'set1',
      description: 'Predefined color scheme for categories',
      validation: {
        enum: ['set1', 'set2', 'set3', 'pastel1', 'pastel2', 'dark2', 'paired', 'accent']
      }
    },
    {
      name: 'customColors',
      type: 'object',
      required: false,
      description: 'Custom color mapping for specific categories',
      examples: [
        { "residential": "#ff0000", "commercial": "#00ff00", "industrial": "#0000ff" }
      ]
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
      defaultValue: 'categorical',
      description: 'Name of the MVT layer'
    }
  ],
  
  outputSchema: {
    type: 'native_data',
    description: 'MVT service with categorical coloring and legend',
    outputFields: [
      {
        name: 'result',
        type: 'string',
        description: 'MVT tile service URL',
        example: '/api/services/mvt/categorical_123/{z}/{x}/{y}.pbf'
      },
      {
        name: 'styleUrl',
        type: 'string',
        description: 'Mapbox Style JSON URL with categorical styling',
        example: '/workspace/results/styles/categorical_123.json'
      },
      {
        name: 'rendererType',
        type: 'string',
        description: 'Renderer type identifier',
        example: 'categorical'
      },
      {
        name: 'categoryField',
        type: 'string',
        description: 'Field used for categorization',
        example: 'land_use'
      },
      {
        name: 'categories',
        type: 'array',
        description: 'List of unique category values',
        example: ['residential', 'commercial', 'industrial']
      },
      {
        name: 'colorMapping',
        type: 'object',
        description: 'Category to color mapping',
        example: { "residential": "#e41a1c", "commercial": "#377eb8", "industrial": "#4daf4a" }
      },
      {
        name: 'legend',
        type: 'array',
        description: 'Legend items for UI display',
        example: [
          { "category": "residential", "color": "#e41a1c" },
          { "category": "commercial", "color": "#377eb8" }
        ]
      }
    ]
  },
  
  capability: {
    executionCategory: 'visualization',
    inputRequirements: {
      supportedDataFormats: ['vector'],
      supportedGeometryTypes: [
        'Point', 'LineString', 'Polygon',
        'MultiPoint', 'MultiLineString', 'MultiPolygon'
      ],
      requiredFields: [
        {
          name: 'categoryField',
          type: 'string',
          description: 'Categorical field for coloring'
        }
      ]
    },
    outputCapabilities: {
      outputType: 'mvt',
      isTerminalNode: true,
      supportsMultipleOutputs: false
    },
    scenarios: [
      'categorical_visualization',
      'land_use_mapping',
      'type_based_coloring',
      'classification_display'
    ],
    priority: 6
  },
  
  capabilities: ['categorical_mapping', 'mvt_publishing', 'legend_generation', 'geometry_agnostic'],
  isBuiltin: true,
  installedAt: new Date()
};
```

---

## 🔧 Executor实现

### CategoricalExecutor

```typescript
import { BaseRendererExecutor } from './BaseRendererExecutor';
import type { NativeData, DataSource } from '../../../core/types';

export interface CategoricalParams {
  dataSourceId: string;
  categoryField: string;         // Required: categorical field name
  colorScheme?: string;          // Predefined color scheme
  customColors?: Record<string, string>;  // Custom category→color mapping
  opacity?: number;
  layerName?: string;
}

export class CategoricalExecutor extends BaseRendererExecutor {
  
  async execute(params: CategoricalParams): Promise<NativeData> {
    console.log('[CategoricalExecutor] Starting categorical rendering...');
    console.log(`[CategoricalExecutor] Parameters:`, params);
    
    return this.executeBaseWorkflow(params, async (p, nativeData) => {
      // Step 1: Get unique categories from data
      const accessor = this.createAccessor(nativeData.type);
      const categories = await this.getUniqueCategories(accessor, nativeData, p.categoryField);
      
      console.log(`[CategoricalExecutor] Found ${categories.length} categories:`, categories);
      
      // Step 2: Generate color mapping
      const colorMapping = this.assignColorsToCategories(
        categories,
        p.colorScheme || 'set1',
        p.customColors
      );
      
      console.log(`[CategoricalExecutor] Color mapping:`, colorMapping);
      
      // Step 3: Generate style via StyleFactory
      const styleUrl = await this.styleFactory.generateCategoricalStyle({
        tilesetId: p._tilesetId,
        layerName: p.layerName || 'categorical',
        categoryField: p.categoryField,
        categories,
        colorMapping,
        opacity: p.opacity || 0.8,
        geometryType: nativeData.metadata?.geometryType
      });
      
      console.log(`[CategoricalExecutor] Style generated: ${styleUrl}`);
      return styleUrl;
    });
  }
  
  protected validateParams(params: CategoricalParams, dataSource: DataSource): void {
    // Validate dataSourceId
    if (!params.dataSourceId) {
      throw new Error('dataSourceId is required');
    }
    
    // Validate categoryField exists
    if (!params.categoryField) {
      throw new Error('categoryField is required');
    }
    
    const fieldInfo = dataSource.metadata?.fields?.find(
      (f: any) => f.name === params.categoryField
    );
    
    if (!fieldInfo) {
      throw new Error(`Category field '${params.categoryField}' not found in data source metadata`);
    }
    
    // Validate field is string type
    if (fieldInfo.type !== 'string') {
      throw new Error(`Category field must be string type, got ${fieldInfo.type}`);
    }
    
    // Validate colorScheme if provided
    if (params.colorScheme) {
      const validSchemes = ['set1', 'set2', 'set3', 'pastel1', 'pastel2', 'dark2', 'paired', 'accent'];
      if (!validSchemes.includes(params.colorScheme)) {
        throw new Error(`Invalid colorScheme: ${params.colorScheme}. Valid options: ${validSchemes.join(', ')}`);
      }
    }
    
    // Validate customColors if provided
    if (params.customColors) {
      for (const [category, color] of Object.entries(params.customColors)) {
        if (!this.isValidColor(color)) {
          throw new Error(`Invalid color for category '${category}': ${color}`);
        }
      }
    }
    
    console.log('[CategoricalExecutor] Parameter validation passed');
  }
  
  protected getRendererSpecificMetadata(params: CategoricalParams, additionalData?: any): any {
    return {
      rendererType: 'categorical',
      categoryField: params.categoryField,
      categories: additionalData?.categories || [],
      colorMapping: additionalData?.colorMapping || {},
      legend: additionalData?.legend || []
    };
  }
  
  /**
   * Get unique category values from data source
   */
  private async getUniqueCategories(
    accessor: any,
    nativeData: NativeData,
    fieldName: string
  ): Promise<string[]> {
    // Use Accessor to get unique values
    if (accessor.getUniqueValues) {
      return await accessor.getUniqueValues(nativeData.reference, fieldName);
    }
    
    // Fallback: read GeoJSON and extract unique values
    const fs = require('fs');
    const content = fs.readFileSync(nativeData.reference, 'utf-8');
    const geojson = JSON.parse(content);
    
    const uniqueValues = new Set<string>();
    for (const feature of geojson.features) {
      const value = feature.properties?.[fieldName];
      if (value !== undefined && value !== null) {
        uniqueValues.add(String(value));
      }
    }
    
    return Array.from(uniqueValues).sort();
  }
  
  /**
   * Assign colors to categories using color scheme or custom mapping
   */
  private assignColorsToCategories(
    categories: string[],
    colorScheme: string,
    customColors?: Record<string, string>
  ): Record<string, string> {
    const colorMapping: Record<string, string> = {};
    
    // Get base colors from scheme
    const schemeColors = this.getColorSchemeColors(colorScheme, categories.length);
    
    // Assign colors to categories
    categories.forEach((category, index) => {
      // Use custom color if provided, otherwise use scheme color
      if (customColors && customColors[category]) {
        colorMapping[category] = customColors[category];
      } else {
        colorMapping[category] = schemeColors[index % schemeColors.length];
      }
    });
    
    return colorMapping;
  }
  
  /**
   * Get colors from predefined scheme
   */
  private getColorSchemeColors(scheme: string, count: number): string[] {
    const schemes: Record<string, string[]> = {
      set1: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'],
      set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
      set3: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5', '#ffed6f'],
      pastel1: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2'],
      pastel2: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc', '#cccccc'],
      dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
      paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
      accent: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666']
    };
    
    const colors = schemes[scheme] || schemes.set1;
    return colors.slice(0, count);
  }
  
  /**
   * Validate color format
   */
  private isValidColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  }
}
```

---

## 🎨 StyleFactory集成

### generateCategoricalStyle方法

```typescript
class StyleFactory {
  async generateCategoricalStyle(config: CategoricalStyleConfig): Promise<string> {
    console.log('[StyleFactory] Generating categorical style...');
    console.log(`[StyleFactory] Categories: ${config.categories.length}`);
    
    // Step 1: Build Mapbox GL JS style JSON with match expression
    const styleJson = this.buildCategoricalStyleJson(config);
    
    // Step 2: Save to filesystem
    const styleUrl = this.saveStyleJson(config.tilesetId, styleJson);
    console.log(`[StyleFactory] Style saved: ${styleUrl}`);
    
    return styleUrl;
  }
  
  private buildCategoricalStyleJson(config: CategoricalStyleConfig): any {
    const { tilesetId, layerName, categoryField, colorMapping, geometryType, opacity } = config;
    
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
    
    // Build match expression for fill-color or circle-color or line-color
    const layerType = GeometryAdapter.getMapboxLayerType(geometryType);
    const colorProperty = this.getColorProperty(layerType);
    
    // Build match expression: ["match", ["get", field], cat1, color1, cat2, color2, ..., defaultColor]
    const matchExpression: any[] = ['match', ['get', categoryField]];
    
    for (const [category, color] of Object.entries(colorMapping)) {
      matchExpression.push(category);
      matchExpression.push(color);
    }
    
    // Default color for unmatched categories
    matchExpression.push('#999999');
    
    // Add layer(s) based on geometry type
    if (layerType === 'circle') {
      style.layers.push({
        id: `${layerName}-points`,
        type: 'circle',
        source: tilesetId,
        'source-layer': 'default',
        paint: {
          [colorProperty]: matchExpression,
          'circle-radius': 5,
          'circle-opacity': opacity || 0.8
        }
      });
    } else if (layerType === 'line') {
      style.layers.push({
        id: `${layerName}-lines`,
        type: 'line',
        source: tilesetId,
        'source-layer': 'default',
        paint: {
          [colorProperty]: matchExpression,
          'line-width': 2,
          'line-opacity': opacity || 0.8
        }
      });
    } else if (layerType === 'fill') {
      style.layers.push(
        {
          id: `${layerName}-fill`,
          type: 'fill',
          source: tilesetId,
          'source-layer': 'default',
          paint: {
            [colorProperty]: matchExpression,
            'fill-opacity': (opacity || 0.8) * 0.7
          }
        },
        {
          id: `${layerName}-outline`,
          type: 'line',
          source: tilesetId,
          'source-layer': 'default',
          paint: {
            'line-color': '#ffffff',
            'line-width': 1,
            'line-opacity': 0.5
          }
        }
      );
    }
    
    // Add metadata and legend
    style.metadata = {
      rendererType: 'categorical',
      categoryField,
      categories: Object.keys(colorMapping),
      colorMapping,
      legend: Object.entries(colorMapping).map(([category, color]) => ({
        category,
        color
      })),
      generatedAt: new Date().toISOString()
    };
    
    return style;
  }
  
  private getColorProperty(layerType: 'circle' | 'line' | 'fill'): string {
    switch (layerType) {
      case 'circle': return 'circle-color';
      case 'line': return 'line-color';
      case 'fill': return 'fill-color';
      default: return 'fill-color';
    }
  }
}
```

---

## 🧪 测试用例

### Test Case 1: 土地利用类型分类

**输入：**
```json
{
  "dataSourceId": "land_use_data",
  "categoryField": "land_use_type",
  "colorScheme": "set1"
}
```

**数据示例：**
```json
{
  "features": [
    { "properties": { "land_use_type": "residential" } },
    { "properties": { "land_use_type": "commercial" } },
    { "properties": { "land_use_type": "industrial" } },
    { "properties": { "land_use_type": "agricultural" } }
  ]
}
```

**期望输出：**
- 4个类别：residential, commercial, industrial, agricultural
- 颜色映射：使用Set1配色方案
- Legend包含4个条目

**验证点：**
- ✅ 正确提取唯一类别值
- ✅ 颜色分配符合Set1方案
- ✅ Match表达式正确生成
- ✅ Legend完整

---

### Test Case 2: 自定义颜色映射

**输入：**
```json
{
  "dataSourceId": "road_network",
  "categoryField": "road_class",
  "customColors": {
    "highway": "#ff0000",
    "arterial": "#ffa500",
    "local": "#00ff00"
  }
}
```

**期望输出：**
- 使用自定义颜色而非配色方案
- highway → #ff0000
- arterial → #ffa500
- local → #00ff00

**验证点：**
- ✅ 自定义颜色优先于配色方案
- ✅ 未指定的类别使用默认灰色

---

### Test Case 3: 大量类别（>9个）

**输入：**
```json
{
  "dataSourceId": "soil_types",
  "categoryField": "soil_class",
  "colorScheme": "set3"
}
```

**数据：** 15个不同的土壤类型

**期望输出：**
- Set3有12种颜色，循环使用
- 前12个类别使用不同颜色
- 后3个类别重复使用前3个颜色

**验证点：**
- ✅ 颜色循环逻辑正确
- ✅ 所有类别都有颜色分配

---

## 📊 性能考虑

### 优点
- ✅ **中等计算开销**：只需提取唯一值
- ✅ **Match表达式高效**：Mapbox GL JS原生支持
- ✅ **图例自动生成**：前端直接可用

### 限制
- ⚠️ **类别数量限制**：超过20个类别时颜色难以区分
- ⚠️ **字符串字段要求**：必须是string类型
- ⚠️ **无顺序关系**：类别之间无数值大小关系

---

## 🔗 与其他组件的交互

```
User Query: "按土地利用类型显示不同颜色"
    ↓
Goal Splitter: { type: 'visualization', description: '...' }
    ↓
TaskPlanner:
  ├─ Stage 1: Filter → visualization renderers
  ├─ Check: has categorical field? → Yes (land_use_type)
  └─ Stage 3: LLM selects → categorical_renderer
    ↓
CategoricalExecutor:
  ├─ Load data source
  ├─ Validate categoryField is string type
  ├─ Extract unique categories via Accessor
  ├─ Assign colors using Set1 scheme
  ├─ Generate MVT tiles
  ├─ Generate Style JSON (via StyleFactory)
  │   ├─ Build match expression
  │   ├─ Create appropriate layer type
  │   └─ Generate legend
  └─ Return NativeData with legend metadata
    ↓
Frontend: Load MVT + Style → Render categorized map + Display legend
```

---

## 📝 实施检查清单

- [ ] 创建CategoricalRendererPlugin定义
- [ ] 实现CategoricalExecutor类
- [ ] 扩展Accessor添加getUniqueValues方法
- [ ] 扩展StyleFactory.generateCategoricalStyle方法
- [ ] 实现8种配色方案的颜色数据
- [ ] 编写单元测试（3个test cases）
- [ ] 编写集成测试（完整workflow）
- [ ] 更新Plugin Registry注册新plugin
- [ ] 更新Prompt Templates添加scenarios
- [ ] 前端测试：验证legend显示正常

---

**文档版本：** v1.0  
**最后更新：** 2026-05-05  
**状态：** Ready for Implementation
