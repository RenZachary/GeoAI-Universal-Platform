# Choropleth Map Feature - Usage Guide

## Overview
The choropleth map feature allows you to generate thematic maps from polygon data with automatic classification and styling, all through natural language queries.

## Example Natural Language Queries

### Chinese Examples
1. **"将陕西省市级行政区划数据按照面积进行专题图渲染，颜色从绿到红过渡"**
   - Generates a choropleth map showing city areas with green-to-red gradient

2. **"制作一份城市绿化率分布专题图"**
   - Creates a choropleth map visualizing urban green rate distribution

3. **"按人口密度显示各区县的专题图，使用红色渐变"**
   - Shows district population density with red color ramp

4. **"生成GDP分布专题图，分5类，蓝色系"**
   - Generates GDP distribution map with 5 classes in blue tones

### English Examples
1. **"Create a choropleth map of districts by population using green colors"**
2. **"Show area distribution with red-to-yellow gradient"**
3. **"Generate a thematic map of income levels with 7 classes"**

## How It Works

### Architecture Flow
```
User Query (Natural Language)
    ↓
LLM Goal Splitter → Identifies as "visualization" type
    ↓
LLM Task Planner → Selects "choropleth_map" plugin with parameters
    ↓
PluginToolWrapper → Routes to ChoroplethMVTExecutor
    ↓
ChoroplethMVTExecutor:
  1. Loads data source via Accessor
  2. Validates numeric field exists
  3. Calls accessor.statisticalOp.calculateStatistics()
  4. Calls accessor.statisticalOp.classify()
  5. Generates Mapbox GL JS style rules
  6. Generates MVT tiles via MVTPublisher
  7. Returns NativeData with embedded styles
    ↓
Frontend receives MVT service URL + style rules
    ↓
Mapbox GL JS renders choropleth map
```

## Plugin Parameters

### Required Parameters
- **dataSourceId**: ID of the polygon data source
- **valueField**: Numeric field to visualize (e.g., "area", "population")

### Optional Parameters
- **classification**: Classification method
  - `quantile` (default) - Equal number of features per class
  - `equal_interval` - Equal value ranges
  - `standard_deviation` - Based on statistical deviation
  - `jenks` - Natural breaks (falls back to quantile)

- **numClasses**: Number of classification classes (default: 5, range: 3-10)

- **colorRamp**: Color scheme
  - Predefined: `greens`, `blues`, `reds`, `oranges`, `purples`, `viridis`, `plasma`, `green_to_red`
  - Custom: Comma-separated hex colors (e.g., "#ff0000,#ffff00,#00ff00")

- **minZoom**: Minimum zoom level (default: 0)
- **maxZoom**: Maximum zoom level (default: 14)
- **layerName**: MVT layer name (default: "choropleth")

## Color Ramp Reference

### Predefined Ramps
| Name | Description | Colors |
|------|-------------|--------|
| greens | Green gradient (light to dark) | 8 shades from #f7fcf5 to #005a32 |
| blues | Blue gradient | 8 shades from #f7fbff to #084594 |
| reds | Red gradient | 8 shades from #fff5f0 to #99000d |
| oranges | Orange gradient | 8 shades from #fff5eb to #8c2d04 |
| purples | Purple gradient | 8 shades from #fcfbfd to #4a1486 |
| viridis | Perceptually uniform | 5 colors optimized for visibility |
| plasma | Warm gradient | 6 colors from purple to yellow |
| green_to_red | Green to red transition | 5 colors: green → yellow → red |

### Custom Colors
You can specify custom colors by providing comma-separated hex values:
```
"#00ff00,#ffff00,#ff0000"  // Green → Yellow → Red
"#0000ff,#ffffff,#ff0000"  // Blue → White → Red
```

## Classification Methods Explained

### Quantile (Default)
- Divides data into equal-sized groups
- Best for: Showing relative rankings
- Example: Top 20%, next 20%, etc.

### Equal Interval
- Divides value range into equal intervals
- Best for: Data with uniform distribution
- Example: 0-100, 100-200, 200-300

### Standard Deviation
- Classes based on distance from mean
- Best for: Normally distributed data
- Example: Mean ± 1σ, Mean ± 2σ

### Jenks Natural Breaks
- Minimizes within-class variance
- Best for: Data with natural groupings
- Note: Currently falls back to quantile

## Output Format

The executor returns a NativeData object with:
```typescript
{
  id: "tileset_id",
  type: "mvt",
  reference: "/api/services/mvt/tileset_id/{z}/{x}/{y}.pbf",
  metadata: {
    tilesetId: "tileset_id",
    serviceUrl: "/api/services/mvt/tileset_id/{z}/{x}/{y}.pbf",
    dataSourceId: "source_id",
    originalDataType: "geojson",
    
    // Thematic mapping metadata
    thematicType: "choropleth",
    valueField: "population",
    classification: "quantile",
    numClasses: 5,
    colorRamp: "greens",
    breaks: [1000, 5000, 10000, 25000, 50000],
    
    // Mapbox GL JS style rules
    styleRules: {
      'fill-color': ['interpolate', ['linear'], ['get', 'population'], ...],
      'fill-opacity': 0.8,
      'fill-outline-color': '#ffffff'
    },
    
    // Legend for UI display
    legend: [
      { class: 0, range: "1000.00 - 5000.00", color: "#f7fcf5" },
      { class: 1, range: "5000.00 - 10000.00", color: "#e5f5e0" },
      // ...
    ],
    
    // Statistics
    statistics: {
      min: 1000,
      max: 50000,
      mean: 15000,
      count: 100
    }
  },
  createdAt: Date
}
```

## Frontend Integration

### Using with Mapbox GL JS
```javascript
// After receiving the result from backend
const result = await fetch('/api/chat', { /* ... */ });
const mvtService = result.data;

// Add MVT source
map.addSource('choropleth-source', {
  type: 'vector',
  url: mvtService.metadata.serviceUrl
});

// Add layer with style rules from backend
map.addLayer({
  id: 'choropleth-layer',
  type: 'fill',
  source: 'choropleth-source',
  'source-layer': 'default',
  paint: mvtService.metadata.styleRules
});

// Display legend
const legend = mvtService.metadata.legend;
legend.forEach(item => {
  // Create legend UI elements
  console.log(`${item.range}: ${item.color}`);
});
```

## Testing

### Run Test Script
```bash
node scripts/test-choropleth-workflow.js
```

This tests:
- Statistical operations (extraction, calculation, classification)
- Color ramp resolution
- Plugin definition structure

### Manual Testing
1. Start the server: `cd server && npm run dev`
2. Upload polygon GeoJSON/Shapefile with numeric fields
3. Use chat interface with queries like:
   - "将行政区数据按人口生成专题图，使用红色渐变"
   - "Show area distribution with green colors"
4. Verify MVT service is generated
5. Check that style rules are present in metadata
6. Render on map to see choropleth visualization

## Troubleshooting

### Common Issues

**Error: "Field 'X' not found in data source metadata"**
- Solution: Verify the field name matches exactly what's in the data source metadata
- Check available fields: Look at dataSource.metadata.fields

**Error: "Field 'X' is not numeric"**
- Solution: Ensure the field contains numeric values
- The system validates field type before processing

**Colors don't match expected gradient**
- Solution: Check the colorRamp parameter
- Verify LLM correctly interpreted your color description
- Try using predefined ramp names instead of descriptions

**Classification looks uneven**
- Solution: Try different classification methods
- Quantile works best for skewed distributions
- Equal interval works best for uniform distributions

## Implementation Details

### Files Modified/Created

#### Accessor Layer
- `server/src/data-access/accessors/impl/geojson/operations/types.ts` - Type definitions
- `server/src/data-access/accessors/impl/geojson/operations/GeoJSONStatisticalOperation.ts` - GeoJSON stats
- `server/src/data-access/accessors/impl/postgis/operations/PostGISStatisticalOperation.ts` - PostGIS stats
- `server/src/data-access/accessors/impl/geojson/GeoJSONBasedAccessor.ts` - Added statisticalOp
- `server/src/data-access/accessors/PostGISAccessor.ts` - Added statisticalOp

#### Executor Layer
- `server/src/plugin-orchestration/executor/visualization/MVTPublisherExecutor.ts` - Refactored as base class
- `server/src/plugin-orchestration/executor/visualization/ChoroplethMVTExecutor.ts` - New executor

#### Plugin Layer
- `server/src/plugin-orchestration/plugins/visualization/ChoroplethMapPlugin.ts` - Plugin definition
- `server/src/plugin-orchestration/plugins/index.ts` - Registered plugin
- `server/src/plugin-orchestration/tools/PluginToolWrapper.ts` - Added routing

#### LLM Prompts
- `workspace/llm/prompts/en-US/goal-splitting.md` - Added visualization scenarios
- `workspace/llm/prompts/en-US/task-planning.md` - Added choropleth pattern

#### Tests
- `scripts/test-choropleth-workflow.js` - Integration test script

## Future Enhancements

Potential improvements for future development:

1. **Jenks Natural Breaks**: Implement proper Jenks algorithm instead of fallback
2. **SQL-Based Classification**: Optimize PostGIS with window functions
3. **Bivariate Choropleth**: Support two-variable classification
4. **Dynamic Reclassification**: Allow users to adjust breaks interactively
5. **Additional Color Ramps**: More ColorBrewer palettes
6. **Contour Maps**: Implement IDW interpolation + marching squares
7. **Heatmap Optimization**: Refactor HeatmapPlugin to use MVT approach

## Architecture Principles Followed

✅ **Accessor Layer Responsibility**: All statistical calculations in Accessor operations  
✅ **MVTPublisherExecutor as Base Class**: ChoroplethMVTExecutor extends it  
✅ **Output Type = 'mvt'**: Style rules in metadata, no extra files  
✅ **LLM-Driven Parameters**: colorRamp determined from natural language  
✅ **Layer Separation**: Clear boundaries between all layers  

---

For questions or issues, refer to the implementation plan at:
`C:\Users\RzcPC\AppData\Roaming\Lingma\SharedClientCache\cache\plans\Choropleth_Map_Implementation_48222ca9.md`
