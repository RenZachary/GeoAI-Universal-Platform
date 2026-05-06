# MVT Layer Visibility State Fix

## Problem

When adding layers via natural language chat ("显示陕西省市级行政区划数据") and clicking "View on Map":

**Symptoms:**
1. ✅ Layer appears on the map (visually visible)
2. ❌ Layer is NOT checked in Layer Management panel
3. ❌ Toolbar shows "Layers (0)" instead of "Layers (1)"
4. ❌ Clicking features shows: `Visible layers: 0`
5. ❌ Feature query doesn't work because no layers are considered "visible"

**Root Cause:**
The `addLayer()` function was **forcing** `visible: false` for all layers, overriding the `visible: true` set by `addLayerFromService()`.

```typescript
// BEFORE (Bug)
layers.value.push({
  ...layer,
  visible: false, // ❌ Always forced to false!
  createdAt: new Date().toISOString()
})
```

This caused a **state inconsistency**:
- Map rendering: Used direct `addLayerToMap()` call → Layer visible on map
- Store state: `layers.value[].visible = false` → Layer not counted as visible
- Computed property: `visibleLayers` returned empty array

## Solution

### 1. Preserve Visible State in `addLayer()`

**File:** `web/src/stores/map.ts`

```typescript
// AFTER (Fixed)
const newLayer = {
  ...layer,
  visible: layer.visible !== undefined ? layer.visible : false, // ✅ Preserve if provided
  createdAt: new Date().toISOString()
}
```

Now the function respects the `visible` property passed in the layer object.

### 2. Centralize Map Addition Logic

Moved the `addLayerToMap()` call into `addLayer()` function:

```typescript
// If layer is visible, add it to map
if (layer.visible && mapInstance.value) {
  console.log(`[Map Store] Adding visible layer to map: ${layer.id}`)
  addLayerToMap(layer)
}
```

This ensures:
- Single source of truth for layer visibility
- Consistent behavior whether layer is added from chat or manually
- No duplicate code paths

### 3. Added Comprehensive Logging

Added debug logs throughout the layer addition flow:

```typescript
console.log('[Map Store] addLayerFromService called with:', service)
console.log('[Map Store] Created layer object:', { id, type, visible })
console.log('[Map Store] Adding new layer:', layer.id, 'visible:', newLayer.visible)
console.log('[Map Store] After addLayer, total layers:', X, 'visible layers:', Y)
```

## Testing

### Test Case 1: Add Layer via Chat

1. Type in chat: "显示陕西省市级行政区划数据"
2. Wait for processing
3. Click "View on Map" button
4. Switch to Map tab

**Expected Results:**
- ✅ Layer appears on map
- ✅ Layer is CHECKED in Layer Management panel
- ✅ Toolbar shows "Layers (1)" or higher
- ✅ Console shows:
  ```
  [Map Store] addLayerFromService called with: {...}
  [Map Store] Created layer object: {id: "...", type: "mvt", visible: true}
  [Map Store] Adding new layer: layer-xxx, type: mvt, visible: true
  [Map Store] Adding visible layer to map: layer-xxx
  [Map Store] After addLayer, total layers: X, visible layers: 1
  ```

### Test Case 2: Click Feature

1. Ensure layer is visible (checked in Layer Management)
2. Click on a polygon/feature on the map

**Expected Console Output:**
```
[MapWorkspace] Map clicked at: LngLat {lng: xxx, lat: xxx}
[MapWorkspace] Has queryable layers: true  ✅ (was false before)
[MapWorkspace] Total layers: X
[MapWorkspace] Visible layers: 1  ✅ (was 0 before)
[MapWorkspace] Querying features at: [xxx, xxx]
[Map Store] Querying 2 sub-layers for layer-xxx
[MapWorkspace] Found features: 1
[MapWorkspace] Showing popup with 1 features
```

**Expected UI:**
- ✅ Feature info popup appears
- ✅ Popup shows feature properties

### Test Case 3: Auto-loaded Data Source Layers

Data sources loaded on page mount should still default to invisible:

1. Refresh page
2. Open Layer Management

**Expected:**
- ✅ All auto-loaded layers are UNCHECKED (invisible)
- ✅ Console shows: `visible: false` for these layers
- ✅ Toolbar shows "Layers (0)" initially

## Files Modified

1. **`web/src/stores/map.ts`**
   - Fixed `addLayer()` to preserve visible state
   - Moved `addLayerToMap()` logic into `addLayer()`
   - Added comprehensive logging
   - Simplified `addLayerFromService()` (removed duplicate map addition)

## Impact Analysis

### Before Fix
```
Chat → addLayerFromService(visible=true) 
     → addLayer() 
     → force visible=false ❌
     → manual addLayerToMap() 
     
Result: Map shows layer, but store says invisible
```

### After Fix
```
Chat → addLayerFromService(visible=true) 
     → addLayer() 
     → preserve visible=true ✅
     → auto addLayerToMap()
     
Result: Map shows layer AND store says visible (consistent!)
```

## Backward Compatibility

✅ **Fully backward compatible**

- Existing code that doesn't specify `visible` defaults to `false`
- Manual layer additions still work as before
- Only affects layers that explicitly set `visible: true`

## Benefits

1. **State Consistency**: Map rendering and store state are always in sync
2. **Simplified Logic**: Single code path for adding layers to map
3. **Better UX**: Users see correct layer count and can interact with features immediately
4. **Easier Debugging**: Comprehensive logging helps diagnose issues
5. **Maintainability**: Less code duplication, clearer intent

## Related Issues Fixed

This fix also resolves:
- ❌ Feature click not working after adding layer from chat
- ❌ Layer count showing 0 when layers are visible
- ❌ Inconsistent UI state between map and layer panel

## Next Steps

After testing, consider:
1. Remove debug console logs in production build
2. Add unit tests for layer visibility state
3. Document layer lifecycle in developer docs
