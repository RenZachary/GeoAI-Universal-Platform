# Choropleth Map - Quick Reference

## 🎯 One-Liner
Generate thematic maps from polygon data with automatic classification via natural language.

## 💬 Example Queries

### Chinese
- "将陕西省市级行政区划数据按照面积进行专题图渲染，颜色从绿到红过渡"
- "制作一份城市绿化率分布专题图"
- "按人口密度显示各区县的专题图，使用红色渐变"

### English
- "Create a choropleth map of districts by population using green colors"
- "Show area distribution with red-to-yellow gradient"

## 🔧 Plugin ID
```
choropleth_map
```

## 📋 Required Parameters
```typescript
{
  dataSourceId: string,    // Polygon data source ID
  valueField: string       // Numeric field to visualize
}
```

## ⚙️ Optional Parameters
```typescript
{
  classification: 'quantile' | 'equal_interval' | 'standard_deviation' | 'jenks',  // default: 'quantile'
  numClasses: number,        // 3-10, default: 5
  colorRamp: string,         // See color ramps below
  minZoom: number,           // default: 0
  maxZoom: number,           // default: 14
  layerName: string          // default: 'choropleth'
}
```

## 🎨 Color Ramps

### Predefined
- `greens` - Green gradient (8 shades)
- `blues` - Blue gradient (8 shades)
- `reds` - Red gradient (8 shades)
- `oranges` - Orange gradient (8 shades)
- `purples` - Purple gradient (8 shades)
- `viridis` - Perceptually uniform (5 colors)
- `plasma` - Warm gradient (6 colors)
- `green_to_red` - Green → Yellow → Red (5 colors)

### Custom
```
"#ff0000,#ffff00,#00ff00"  // Red → Yellow → Green
```

## 📊 Classification Methods

| Method | Best For | Description |
|--------|----------|-------------|
| quantile | Skewed data | Equal number of features per class |
| equal_interval | Uniform data | Equal value ranges |
| standard_deviation | Normal distribution | Based on distance from mean |
| jenks | Natural groupings | Minimizes within-class variance (falls back to quantile) |

## 🏗️ Architecture

```
LLM → choropleth_map plugin → ChoroplethMVTExecutor
                                    ↓
                        Accessor.statisticalOp
                                    ↓
                    calculateStatistics() + classify()
                                    ↓
                        MVTPublisher (tiles)
                                    ↓
                    NativeData { type: 'mvt', metadata.styleRules }
```

## 📁 Key Files

### Created
- `server/src/data-access/accessors/impl/geojson/operations/GeoJSONStatisticalOperation.ts`
- `server/src/data-access/accessors/impl/postgis/operations/PostGISStatisticalOperation.ts`
- `server/src/plugin-orchestration/executor/visualization/ChoroplethMVTExecutor.ts`
- `server/src/plugin-orchestration/plugins/visualization/ChoroplethMapPlugin.ts`

### Modified
- `server/src/plugin-orchestration/executor/visualization/MVTPublisherExecutor.ts` (base class)
- `workspace/llm/prompts/en-US/goal-splitting.md` (visualization scenarios)
- `workspace/llm/prompts/en-US/task-planning.md` (choropleth pattern)

## ✅ Architecture Principles

1. **Accessor Responsibility**: Stats in Accessor operations, not Executor
2. **Base Class Pattern**: ChoroplethMVTExecutor extends MVTPublisherExecutor
3. **MVT Output**: Style rules in metadata, no extra files
4. **LLM-Driven**: colorRamp from natural language
5. **Layer Separation**: Clear boundaries between all layers

## 🧪 Testing

```bash
node scripts/test-choropleth-workflow.js
```

## 🚀 Quick Start

1. Upload polygon data with numeric fields
2. Chat: "将行政区数据按人口生成专题图，使用红色渐变"
3. System generates MVT service with style rules
4. Frontend renders choropleth map

## 📖 Full Documentation

- Usage Guide: `docs/implementation/CHOROPLETH-MAP-USAGE-GUIDE.md`
- Implementation Summary: `docs/implementation/CHOROPLETH-MAP-IMPLEMENTATION-SUMMARY.md`
- Plan: `C:\Users\RzcPC\AppData\Roaming\Lingma\SharedClientCache\cache\plans\Choropleth_Map_Implementation_48222ca9.md`

---

**Status**: ✅ Production Ready  
**Date**: May 5, 2026
