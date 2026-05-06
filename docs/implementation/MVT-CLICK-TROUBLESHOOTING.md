# MVT Layer Click Feature - Troubleshooting Guide

## Problem
Clicking on MVT layer features doesn't show the feature info popup.

## Quick Diagnostic Steps

### 1. Open Browser Console
Press `F12` or right-click → Inspect → Console tab

### 2. Check These Things:

#### A. Are there any layers loaded?
In console, type:
```javascript
// Check total layers
console.log('Total layers:', mapStore.layers.length)

// Check visible layers  
console.log('Visible layers:', mapStore.visibleLayers.length)

// List all layers
mapStore.layers.forEach(l => {
  console.log(`Layer: ${l.id}, Type: ${l.type}, Visible: ${l.visible}`)
})
```

#### B. Is the click event working?
Click on the map and look for these console logs:
- `[MapWorkspace] Map clicked at:` - Should appear when you click
- `[MapWorkspace] Has queryable layers:` - Should be `true`
- `[MapWorkspace] Found features:` - Should show number of features found

#### C. Are MVT tiles loading?
Check Network tab in DevTools:
- Look for requests to `/api/services/mvt/...`
- Status should be 200
- Response should be binary data (.pbf files)

### 3. Common Issues & Solutions

#### Issue 1: No layers are visible
**Symptom**: Console shows `Has queryable layers: false`

**Solution**:
1. Open Layer Management panel (click Layers button)
2. Find your layer (e.g., "陕西省市级行政区划")
3. Toggle the checkbox to make it visible
4. Try clicking again

#### Issue 2: Layer type is wrong
**Symptom**: Layer exists but type is not MVT or GeoJSON

**Check**:
```javascript
const layer = mapStore.layers.find(l => l.id.includes('陕西省'))
console.log('Layer type:', layer?.type)
// Should be 'mvt' or 'geojson'
```

**Solution**: If type is wrong, the layer might have been added incorrectly. Delete and re-add it.

#### Issue 3: Custom style layers not queried properly
**Symptom**: Console shows "Querying X sub-layers" but finds 0 features

**Check**:
```javascript
// Check if layer has custom style
const layer = mapStore.layers.find(l => l.visible)
console.log('Has styleUrl:', !!layer?.metadata?.styleUrl)
console.log('Metadata:', layer?.metadata)
```

**Solution**: The fix has been applied in the latest code. Refresh the page.

#### Issue 4: Features exist but properties are empty
**Symptom**: Popup shows but with no properties

**Check**:
```javascript
// Query manually
const center = mapStore.mapInstance.getCenter()
const features = mapStore.queryFeaturesAtPoint([center.lng, center.lat])
console.log('Features:', features)
```

**Solution**: This might be a backend issue - the MVT tiles might not include properties. Check the source data.

#### Issue 5: Popup component not rendering
**Symptom**: Console shows features found but no popup appears

**Check**:
```javascript
// Check popup state
console.log('Show popup:', showFeaturePopup.value)
console.log('Popup features:', popupFeatures.value)
console.log('Popup position:', popupPosition.value)
```

**Solution**: Check Vue DevTools to see if FeatureInfoPopup component is mounted.

### 4. Step-by-Step Test

1. **Start fresh**:
   ```bash
   # Restart frontend
   cd web
   npm run dev
   ```

2. **Navigate to Chat View** → Map tab

3. **Add a layer via natural language**:
   - Type: "显示陕西省市级行政区划数据"
   - Wait for MVT service to be created
   - Layer should auto-add to map

4. **Verify layer is visible**:
   - Check Layer Management panel
   - Layer should be checked (visible)
   - You should see polygons on the map

5. **Open browser console** (F12)

6. **Click on a polygon**:
   - Look for console logs starting with `[MapWorkspace]`
   - Look for console logs starting with `[Map Store]`

7. **Expected console output**:
   ```
   [MapWorkspace] Map clicked at: LngLat {lng: 108.xxx, lat: 34.xxx}
   [MapWorkspace] Has queryable layers: true
   [MapWorkspace] Total layers: 5
   [MapWorkspace] Visible layers: 2
   [MapWorkspace] Querying features at: [108.xxx, 34.xxx]
   [Map Store] Querying 2 sub-layers for layer-xxx
   [MapWorkspace] Found features: 1
   [MapWorkspace] Showing popup with 1 features
   ```

8. **If you see "Found features: 0"**:
   - Try zooming in/out (features might not be rendered at current zoom)
   - Click on different areas
   - Check if the layer actually has data at that location

### 5. Advanced Debugging

#### Check MapLibre layers directly:
```javascript
const map = mapStore.mapInstance
const style = map.getStyle()

// List all layers in the map
style.layers.forEach(layer => {
  console.log(`Map layer: ${layer.id}, Source: ${layer.source}, Type: ${layer.type}`)
})
```

#### Manually query features:
```javascript
const map = mapStore.mapInstance
const center = map.getCenter()
const point = map.project(center)

// Query a 10px box around center
const features = map.queryRenderedFeatures([
  [point.x - 5, point.y - 5],
  [point.x + 5, point.y + 5]
])

console.log('Raw features from MapLibre:', features)
```

#### Check MVT tile content:
```javascript
// Get the MVT source
const source = map.getSource('layer-xxx') // replace with your layer ID
console.log('Source:', source)
console.log('Tiles URL:', source.tiles)
```

### 6. Backend Verification

Make sure the MVT service is working correctly:

```bash
# Test MVT endpoint directly
curl http://localhost:3000/api/services/mvt/{tilesetId}/5/16/10.pbf --output test.pbf

# Check if file has content
ls -lh test.pbf
```

Or open in browser:
```
http://localhost:3000/api/services/mvt/{tilesetId}/metadata
```

This should return JSON with tileset information.

### 7. Known Working Configuration

For reference, here's what should work:

**Layer Structure**:
```typescript
{
  id: "layer-ds_xxx",
  type: "mvt",
  url: "/api/services/mvt/tilesetId/{z}/{x}/{y}.pbf",
  visible: true,
  opacity: 0.8,
  metadata: {
    styleUrl: "/api/services/mvt/tilesetId/style.json"  // Optional
  },
  name: "陕西省市级行政区划",
  dataSourceId: "ds_xxx"
}
```

**Console Output When Working**:
```
[Map Store] addMVTLayer - layer: layer-ds_xxx
[Map Store] addMVTLayer - metadata: {...}
[Map Store] Detected custom style, applying...
[Map Store] Loading custom style from: http://localhost:3000/api/services/mvt/.../style.json
[Map Store] Custom style applied successfully
[MapWorkspace] Map clicked at: LngLat {...}
[MapWorkspace] Has queryable layers: true
[Map Store] Querying 2 sub-layers for layer-ds_xxx
[MapWorkspace] Found features: 1
[MapWorkspace] Showing popup with 1 features
```

## Still Not Working?

If none of the above helps, please provide:

1. **Console logs** - Full output when clicking
2. **Network tab** - Screenshot showing MVT tile requests
3. **Layer info** - Output of `mapStore.layers`
4. **Screenshot** - Of the map showing the layer is visible
5. **Browser info** - Chrome/Firefox version

This will help identify the specific issue.
