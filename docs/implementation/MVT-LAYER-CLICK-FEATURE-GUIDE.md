# MVT Layer Click Feature - Testing Guide

## Overview
This feature allows users to click on MVT (Mapbox Vector Tiles) layers to view feature information in a popup.

## Implementation Summary

### Files Modified/Created:
1. **New Component**: `web/src/components/map/FeatureInfoPopup.vue`
   - Displays feature properties in a styled popup
   - Supports multiple features at the same location
   - Bilingual support (English/Chinese)

2. **Enhanced Store**: `web/src/stores/map.ts`
   - Added `queryFeaturesAtPoint()` method
   - Queries visible MVT and GeoJSON layers
   - Returns feature properties with layer information

3. **Updated Map Workspace**: `web/src/components/chat-map/MapWorkspace.vue`
   - Integrated FeatureInfoPopup component
   - Added click event handler for map
   - Manages popup state and position

4. **i18n Translations**: 
   - `web/src/i18n/locales/en-US.ts` - Added English translations
   - `web/src/i18n/locales/zh-CN.ts` - Added Chinese translations

## How It Works

### User Flow:
1. User views map with MVT or GeoJSON layers
2. User clicks on any feature on the map
3. System queries all visible layers at that point
4. Popup appears showing feature properties
5. User can close popup by clicking X button or clicking elsewhere

### Technical Flow:
```
User Click → Map Click Event → queryFeaturesAtPoint() → 
Query Visible Layers → Collect Features → Show Popup
```

## Testing Steps

### Prerequisites:
- Backend server running (`npm run dev` in `/server`)
- Frontend server running (`npm run dev` in `/web`)
- At least one data source uploaded (GeoJSON, Shapefile, or PostGIS table)
- Data source converted to MVT or available as GeoJSON

### Test Case 1: Single Feature Click
1. Navigate to Chat View → Map tab
2. Ensure at least one MVT/GeoJSON layer is visible (toggle in layer panel)
3. Click on any feature on the map
4. **Expected**: Popup appears showing feature properties
5. Verify:
   - Popup displays near click location
   - Properties are shown in a table format
   - Property names and values are correct
   - Close button works

### Test Case 2: Multiple Features at Same Location
1. Zoom to an area where multiple layers overlap
2. Make sure multiple layers are visible
3. Click on the overlapping area
4. **Expected**: Popup shows all features from different layers
5. Verify:
   - Each feature is separated
   - Layer name is shown for each feature
   - All properties are displayed

### Test Case 3: No Features Found
1. Click on an empty area of the map (no features)
2. **Expected**: If popup was open, it closes; otherwise nothing happens
3. Verify no errors in console

### Test Case 4: Language Switching
1. Open feature popup
2. Switch language between English and Chinese
3. **Expected**: Popup labels update to selected language
4. Verify:
   - "Feature Information" / "要素信息"
   - "Properties" / "属性"
   - "No feature found at this location" / "此位置未找到要素"

### Test Case 5: Different Layer Types
Test with:
- **MVT layers** (from PostGIS or file-based MVT services)
- **GeoJSON layers** (direct GeoJSON files)
- **Choropleth layers** (styled MVT with custom styles)

## Known Limitations

1. **Only Visible Layers**: Only queries features from layers that are currently visible
2. **Client-Side Querying**: Uses MapLibre's `queryRenderedFeatures`, which only returns rendered features
3. **Zoom Dependency**: Features may not be available at all zoom levels (depends on MVT tile generation)
4. **Performance**: Querying many layers simultaneously may have slight delay

## Troubleshooting

### Popup Doesn't Appear
- Check if any MVT/GeoJSON layers are visible
- Verify layer has features at the clicked location
- Check browser console for errors
- Ensure map instance is properly initialized

### Wrong Properties Shown
- Verify the data source has proper attributes
- Check if the correct layer is being queried
- Inspect the layer's metadata in layer info dialog

### Popup Position Issues
- Popup should appear slightly offset from click point (10px right and down)
- If popup goes off-screen, it may need CSS adjustments

## Future Enhancements

Potential improvements:
1. Add highlight effect to clicked feature
2. Support for feature editing from popup
3. Export feature properties to CSV/JSON
4. Search/filter within feature properties
5. Custom styling per layer type
6. Persistent popup that stays until explicitly closed
7. Keyboard shortcuts (ESC to close)

## Code Quality Notes

- ✅ TypeScript types properly defined
- ✅ i18n support for bilingual interface
- ✅ Error handling with try-catch blocks
- ✅ Responsive popup positioning
- ✅ Clean separation of concerns (component, store, view)
- ✅ Follows existing code patterns and conventions
