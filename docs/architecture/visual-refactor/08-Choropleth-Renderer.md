# Choropleth Renderer 详细设计

## 📋 概述

**Choropleth Renderer（分级统计渲染器）** 用于按数值字段对地理要素进行分级着色，适用于连续数据的可视化。

### 适用场景

- "用面积等级专题图显示陕西省，红色系"
- "按人口密度分级显示各区县"
- "用5级分类显示GDP分布"
- "按温度渐变显示气象站点"

### 核心特点

- ✅ **连续渐变**：颜色随数值连续变化
- ✅ **统计分类**：支持多种分类方法（quantile, equal_interval等）
- ✅ **自动生成断点**：基于数据分布
- ✅ **完整图例**：显示数值范围和对应颜色

---

## 🎯 Plugin定义

```typescript
export const ChoroplethRendererPlugin: Plugin = {
  id: 'choropleth_renderer',
  name: 'Choropleth Renderer',
  version: '1.0.0',
  description: 'Create choropleth thematic maps with statistical classification and continuous color gradients.',
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
      name: 'valueField',
      type: 'string',
      required: true,
      description: 'Numeric field for classification (must be number type)',
      examples: ['area', 'population', 'gdp', 'temperature']
    },
    {
      name: 'classification',
      type: 'string',
      required: false,
      defaultValue: 'quantile',
      description: 'Classification method',
      validation: {
        enum: ['quantile', 'equal_interval', 'std_dev', 'jenks']
      }
    },
    {
      name: 'numClasses',
      type: 'number',
      required: false,
      defaultValue: 5,
      description: 'Number of classification classes',
      validation: { min: 3, max: 10 }
    },
    {
      name: 'colorRamp',
      type: 'string',
      required: false,
      defaultValue: 'greens',
      description: 'Color ramp for gradient',
      validation: {
        enum: ['greens', 'blues', 'reds', 'oranges', 'purples', 'viridis', 'plasma', 'green_to_red']
      }
    },
    {
      name: 'opacity',
      type: 'number',
      required: false,
      defaultValue: 0.8,
      description: 'Opacity (0-1)'
    },
    {
      name: 'layerName',
      type: 'string',
      required: false,
      defaultValue: 'choropleth',
      description: 'MVT layer name'
    }
  ],
  
  outputSchema: {
    type: 'native_data',
    description: 'MVT service with choropleth styling and statistics',
    outputFields: [
      { name: 'result', type: 'string', description: 'MVT URL' },
      { name: 'styleUrl', type: 'string', description: 'Style JSON URL' },
      { name: 'rendererType', type: 'string', example: 'choropleth' },
      { name: 'valueField', type: 'string', example: 'population' },
      { name: 'classification', type: 'string', example: 'quantile' },
      { name: 'breaks', type: 'array', description: 'Classification breaks' },
      { name: 'statistics', type: 'object', description: 'Min, max, mean, std' },
      { name: 'legend', type: 'array', description: 'Legend with ranges and colors' }
    ]
  },
  
  capability: {
    executionCategory: 'visualization',
    inputRequirements: {
      supportedDataFormats: ['vector'],
      supportedGeometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'],
      requiredFields: [
        { name: 'valueField', type: 'number', description: 'Numeric field for classification' }
      ]
    },
    outputCapabilities: {
      outputType: 'mvt',
      isTerminalNode: true,
      supportsMultipleOutputs: false
    },
    scenarios: ['thematic_mapping', 'statistical_visualization', 'gradient_coloring', 'classification'],
    priority: 5
  },
  
  capabilities: ['choropleth_mapping', 'statistical_classification', 'mvt_publishing', 'legend_generation'],
  isBuiltin: true,
  installedAt: new Date()
};
```

---

## 🔧 Executor实现

```typescript
export interface ChoroplethParams {
  dataSourceId: string;
  valueField: string;            // Required: numeric field
  classification?: 'quantile' | 'equal_interval' | 'std_dev' | 'jenks';
  numClasses?: number;           // 3-10
  colorRamp?: string;
  opacity?: number;
  layerName?: string;
}

export class ChoroplethExecutor extends BaseRendererExecutor {
  
  async execute(params: ChoroplethParams): Promise<NativeData> {
    console.log('[ChoroplethExecutor] Starting choropleth rendering...');
    
    return this.executeBaseWorkflow(params, async (p, nativeData) => {
      // Step 1: Calculate statistics using Accessor
      const accessor = this.createAccessor(nativeData.type);
      const stats = await accessor.statisticalOp.calculateStatistics(
        nativeData.reference,
        p.valueField
      );
      
      console.log(`[ChoroplethExecutor] Statistics:`, stats);
      
      // Step 2: Perform classification
      const breaks = await accessor.statisticalOp.classify(
        stats.values,
        p.classification || 'quantile',
        p.numClasses || 5
      );
      
      console.log(`[ChoroplethExecutor] Breaks:`, breaks);
      
      // Step 3: Generate style via StyleFactory (pass colorRamp name, not resolved colors)
      const styleUrl = await this.styleFactory.generateChoroplethStyle({
        tilesetId: p._tilesetId,
        layerName: p.layerName || 'choropleth',
        valueField: p.valueField,
        breaks,
        colorRamp: p.colorRamp || 'greens',  // Pass name, let StyleFactory resolve
        numClasses: breaks.length - 1,
        opacity: p.opacity || 0.8,
        geometryType: nativeData.metadata?.geometryType
      });
      
      return styleUrl;
    });
  }
  
  protected validateParams(params: ChoroplethParams, dataSource: DataSource): void {
    if (!params.dataSourceId) {
      throw new Error('dataSourceId is required');
    }
    
    if (!params.valueField) {
      throw new Error('valueField is required');
    }
    
    const fieldInfo = dataSource.metadata?.fields?.find(
      (f: any) => f.name === params.valueField
    );
    
    if (!fieldInfo) {
      throw new Error(`Value field '${params.valueField}' not found`);
    }
    
    if (fieldInfo.type !== 'number') {
      throw new Error(`Value field must be numeric, got ${fieldInfo.type}`);
    }
    
    if (params.numClasses && (params.numClasses < 3 || params.numClasses > 10)) {
      throw new Error('numClasses must be between 3 and 10');
    }
  }
  
  protected getRendererSpecificMetadata(params: ChoroplethParams, additionalData?: any): any {
    return {
      rendererType: 'choropleth',
      valueField: params.valueField,
      classification: params.classification || 'quantile',
      breaks: additionalData?.breaks || [],
      colorRamp: params.colorRamp || 'greens',
      statistics: additionalData?.statistics || {},
      legend: additionalData?.legend || []
    };
  }
}
```

---

## 🎨 StyleFactory集成

```typescript
class StyleFactory {
  private colorEngine: ColorResolutionEngine;
  
  async generateChoroplethStyle(config: ChoroplethStyleConfig): Promise<string> {
    console.log('[StyleFactory] Generating choropleth style...');
    
    // Step 1: Resolve colorRamp to actual colors (delegate to ColorEngine)
    const colors = await this.colorEngine.resolveColorRamp(
      config.colorRamp,
      config.numClasses
    );
    
    console.log(`[StyleFactory] Colors:`, colors);
    
    // Step 2: Build interpolate expression
    const styleJson = this.buildChoroplethStyleJson({
      ...config,
      colors  // Now we have resolved colors
    });
    
    // Step 3: Save
    const styleUrl = this.saveStyleJson(config.tilesetId, styleJson);
    return styleUrl;
  }
  
  private buildChoroplethStyleJson(config: ChoroplethStyleConfigWithColors): any {
    const { tilesetId, layerName, valueField, breaks, colors, geometryType, opacity } = config;
    
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
    
    // Build interpolate expression: ["interpolate", ["linear"], ["get", field], break1, color1, break2, color2, ...]
    const interpolateExpression: any[] = [
      'interpolate',
      ['linear'],
      ['get', valueField]
    ];
    
    for (let i = 0; i < breaks.length; i++) {
      interpolateExpression.push(breaks[i]);
      interpolateExpression.push(colors[Math.min(i, colors.length - 1)]);
    }
    
    const layerType = GeometryAdapter.getMapboxLayerType(geometryType);
    const colorProperty = this.getColorProperty(layerType);
    
    if (layerType === 'fill') {
      style.layers.push(
        {
          id: `${layerName}-fill`,
          type: 'fill',
          source: tilesetId,
          'source-layer': 'default',
          paint: {
            [colorProperty]: interpolateExpression,
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
    } else if (layerType === 'line') {
      style.layers.push({
        id: `${layerName}-lines`,
        type: 'line',
        source: tilesetId,
        'source-layer': 'default',
        paint: {
          [colorProperty]: interpolateExpression,
          'line-width': 2,
          'line-opacity': opacity || 0.8
        }
      });
    } else if (layerType === 'circle') {
      style.layers.push({
        id: `${layerName}-points`,
        type: 'circle',
        source: tilesetId,
        'source-layer': 'default',
        paint: {
          [colorProperty]: interpolateExpression,
          'circle-radius': 5,
          'circle-opacity': opacity || 0.8
        }
      });
    }
    
    // Generate legend
    const legend = breaks.slice(0, -1).map((breakVal, i) => ({
      range: `${breakVal.toFixed(2)} - ${breaks[i + 1].toFixed(2)}`,
      color: colors[i]
    }));
    
    style.metadata = {
      rendererType: 'choropleth',
      valueField,
      classification: config.classificationMethod || 'quantile',
      breaks,
      colors,
      legend,
      generatedAt: new Date().toISOString()
    };
    
    return style;
  }
}
```

---

## 🧪 测试用例

### Test Case 1: 人口密度分级

**输入：**
```json
{
  "dataSourceId": "districts",
  "valueField": "population_density",
  "classification": "quantile",
  "numClasses": 5,
  "colorRamp": "reds"
}
```

**期望输出：**
- 5个分级断点
- 红色渐变
- Legend显示5个范围

---

### Test Case 2: 面积等间距分级

**输入：**
```json
{
  "dataSourceId": "provinces",
  "valueField": "area",
  "classification": "equal_interval",
  "numClasses": 7,
  "colorRamp": "greens"
}
```

---

### Test Case 3: 默认参数

**输入：**
```json
{
  "dataSourceId": "any_data",
  "valueField": "some_numeric_field"
}
```

**期望：**
- classification: quantile (default)
- numClasses: 5 (default)
- colorRamp: greens (default)

---

## 📝 实施检查清单

- [ ] 创建ChoroplethRendererPlugin定义
- [ ] 实现ChoroplethExecutor类
- [ ] 扩展Accessor.statisticalOp.classify方法
- [ ] 扩展StyleFactory.generateChoroplethStyle方法
- [ ] 实现4种分类算法
- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 注册plugin
- [ ] 更新prompts
- [ ] 前端测试

---

**文档版本：** v1.0  
**最后更新：** 2026-05-05  
**状态：** Ready for Implementation
