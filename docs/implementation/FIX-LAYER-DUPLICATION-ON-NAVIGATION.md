# Layer Duplication Fix - Navigation Issue

## Problem Description

When navigating through the application, the number of map layers changes depending on the navigation path:

- **Direct navigation** to `http://localhost:5173/map`: Shows **0 layers** (or correct count)
- **Indirect navigation** (`/data` → `/map` → `/data` → `/map`): Shows **8 layers** (duplicated)

Each time you navigate away from and back to the map view, the layers are added again, causing duplication.

## Root Cause Analysis

### Issue 1: No Duplicate Check
In `web/src/views/MapView.vue`, the `onMounted` hook runs every time the component is mounted (when navigating to `/map`). It loads all data sources and adds them as layers without checking if they already exist:

```typescript
// BEFORE: Always adds layers without checking
for (const ds of dataSourceStore.dataSources) {
  mapStore.addLayer({
    id: `layer-${ds.id}`,
    // ... layer config
  })
}
```

### Issue 2: No Cleanup on Unmount
When navigating away from the map view, the component doesn't clean up the auto-added layers. When you return, it adds them again.

```typescript
// MISSING: No onUnmounted cleanup
```

### Why This Happens
Vue Router may cache components or the Pinia store persists state across navigation. The `onMounted` hook fires each time the route is activated, but there's no corresponding cleanup.

## Solution Implemented

### Fix 1: Check for Existing Layers Before Adding
Added a duplicate check in the `onMounted` hook:

```typescript
// AFTER: Check if layer exists before adding
for (const ds of dataSourceStore.dataSources) {
  const layerId = `layer-${ds.id}`
  
  // Check if layer already exists to prevent duplicates
  const existingLayer = mapStore.layers.find(l => l.id === layerId)
  if (existingLayer) {
    console.log(`Layer ${layerId} already exists, skipping...`)
    continue
  }
  
  // Only add if it doesn't exist
  mapStore.addLayer({
    id: layerId,
    // ... layer config
  })
}
```

### Fix 2: Add Cleanup on Component Unmount
Added `onUnmounted` hook to remove auto-added layers when leaving the map view:

```typescript
import { onMounted, onUnmounted, ref, computed } from 'vue'

// ... component logic ...

// Cleanup on component unmount
onUnmounted(() => {
  // Remove all auto-added layers from data sources
  dataSourceStore.dataSources.forEach(ds => {
    const layerId = `layer-${ds.id}`
    mapStore.removeLayer(layerId)
  })
})
```

## Files Modified

1. **`web/src/views/MapView.vue`**
   - Added import for `onUnmounted`
   - Added duplicate layer check in `onMounted`
   - Added cleanup logic in `onUnmounted`

## Testing Instructions

### Test Case 1: Direct Navigation
1. Start the application
2. Navigate directly to `http://localhost:5173/map`
3. Open the layer panel
4. **Expected**: Should show the correct number of layers (e.g., 8 if you have 8 data sources)

### Test Case 2: Repeated Navigation
1. Navigate to `http://localhost:5173/data`
2. Switch to map: `http://localhost:5173/map`
3. Switch back to data: `http://localhost:5173/data`
4. Switch to map again: `http://localhost:5173/map`
5. Repeat steps 2-4 multiple times
6. Open the layer panel
7. **Expected**: Layer count should remain constant (e.g., always 8), not increase

### Test Case 3: Console Verification
1. Open browser DevTools console
2. Navigate between `/data` and `/map` multiple times
3. **Expected**: Should see "Layer layer-ds_xxx already exists, skipping..." messages on subsequent visits

## Benefits

1. **No Layer Duplication**: Layers are only added once per data source
2. **Clean State Management**: Layers are removed when leaving the map view
3. **Better Performance**: Prevents accumulation of unnecessary layers
4. **Consistent UX**: Same layer count regardless of navigation path

## Alternative Solutions Considered

### Option A: Clear All Layers on Mount
```typescript
onMounted(() => {
  mapStore.clearAllLayers()
  // Then add layers
})
```
**Rejected**: Would remove user-added layers (not just auto-added ones)

### Option B: Use a Flag to Track Initialization
```typescript
const isInitialized = ref(false)
onMounted(() => {
  if (isInitialized.value) return
  // Add layers
  isInitialized.value = true
})
```
**Rejected**: Doesn't handle data source changes (new uploads)

### Option C: Current Solution (Implemented) ✅
- Check for existing layers before adding
- Clean up on unmount
- Allows new data sources to be added dynamically

## Related Code

- **Map Store**: `web/src/stores/map.ts` - Manages layer state
- **Data Source Store**: `web/src/stores/dataSources.ts` - Manages data sources
- **Layer Addition Logic**: `web/src/views/MapView.vue` lines 190-232

## Future Improvements

1. **Distinguish Auto vs Manual Layers**: Add a flag to identify auto-added layers for better cleanup
2. **Watch Data Source Changes**: Use Vue watchers to automatically add/remove layers when data sources change
3. **Persist User Preferences**: Remember which auto-layers users want visible

---

**Date Fixed**: 2026-05-05  
**Issue Type**: Bug - State Management  
**Severity**: Medium (affects UX but not functionality)
