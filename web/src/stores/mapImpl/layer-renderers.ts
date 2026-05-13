import type { MapLayer } from '@/types'
import { LayerType } from '@/types'
import type { MapState } from './state'

/**
 * Layer Renderers
 * Handles rendering different layer types on the map
 */
export function useLayerRenderers(state: MapState) {
  /**
   * Add layer to map based on type
   */
  function addLayerToMap(layer: Omit<MapLayer, 'createdAt'>) {
    if (!state.mapInstance.value) return

    const map = state.mapInstance.value as any

    switch (layer.type) {
      case LayerType.MVT:
        addMVTLayer(map, layer)
        break
      case LayerType.WMS:
      case LayerType.Image:
        addWMSLayer(map, layer)
        break
      case LayerType.Heatmap:
        addHeatmapLayer(map, layer)
        break
    }
  }

  /**
   * Add MVT (Vector Tile) layer
   */
  function addMVTLayer(map: any, layer: Omit<MapLayer, 'createdAt'>) {
    if (map.getSource(layer.id)) {
      map.removeLayer(layer.id)
      map.removeSource(layer.id)
    }

    // Check if this is a choropleth/thematic map with custom style
    const styleUrl = layer.styleUrl || layer.metadata?.styleUrl
    
    if (styleUrl) {
      // Apply custom style from StyleFactory
      applyCustomStyleFromURL(map, layer, styleUrl)
    } else {
      console.log('[Map Store] No custom style, using default')
      // Use default styling for regular MVT layers
      applyDefaultMVTStyle(map, layer)
    }
  }

  /**
   * Apply custom Mapbox Style JSON from URL
   */
  async function applyCustomStyleFromURL(map: any, layer: Omit<MapLayer, 'createdAt'>, styleUrl: string) {
    try {      
      // Check if source already exists and remove it first
      if (map.getSource(layer.id)) {
        // Remove all layers that use this source
        const allLayers = map.getStyle().layers
        allLayers.forEach((mapLayer: any) => {
          if (mapLayer.source === layer.id && mapLayer.id !== layer.id) {
            if (map.getLayer(mapLayer.id)) {
              map.removeLayer(mapLayer.id)
            }
          }
        })
        // Remove the source
        map.removeSource(layer.id)
      }
      
      // Convert relative URL to absolute (but NOT for blob URLs)
      const fullStyleUrl = styleUrl.startsWith('http') || styleUrl.startsWith('blob:')
        ? styleUrl
        : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}${styleUrl}`

      // Fetch the style JSON (handle blob URLs directly)
      let styleJson: any;
      if (styleUrl.startsWith('blob:')) {
        const response = await fetch(styleUrl);
        styleJson = await response.json();
      } else {
        const response = await fetch(fullStyleUrl);
        if (!response.ok) {
          throw new Error(`Failed to load style: ${response.status} ${response.statusText}`);
        }
        styleJson = await response.json();
      }

      // Add vector source
      const tilesUrl = layer.url.startsWith('http')
        ? layer.url
        : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}${layer.url}`
      
      map.addSource(layer.id, {
        type: 'vector',
        tiles: [tilesUrl],
        minzoom: layer.minZoom || 0,
        maxzoom: layer.maxZoom || 22
      })
      
      // Add layers from style JSON
      if (styleJson.layers && Array.isArray(styleJson.layers)) {        
        const addedLayerIds: string[] = [];
        
        styleJson.layers.forEach((styleLayer: any, index: number) => {          
          const layerToAdd: any = {
            id: styleLayer.id,
            type: styleLayer.type,
            source: layer.id,
            'source-layer': styleLayer['source-layer'] || 'default',
            paint: styleLayer.paint
          }
          
          if (styleLayer.minzoom !== undefined) {
            layerToAdd.minzoom = styleLayer.minzoom
          }
          if (styleLayer.maxzoom !== undefined) {
            layerToAdd.maxzoom = styleLayer.maxzoom
          }
          
          try {
            map.addLayer(layerToAdd)
            addedLayerIds.push(styleLayer.id)
          } catch (error) {
            console.error(`[Map Store] ❌ Failed to add layer ${styleLayer.id}:`, error)
          }
        })

        // Update the layer record in store to reflect the actual layer IDs in the map
        if (addedLayerIds.length > 0) {
          const layerIndex = (state.layers.value || []).findIndex(l => l.id === layer.id)
          if (layerIndex !== -1 && state.layers.value) {
            // Store the actual sub-layer IDs in metadata for querying
            state.layers.value[layerIndex].metadata = {
              ...state.layers.value[layerIndex].metadata,
              actualLayerIds: addedLayerIds
            }
          }
        }
      }
    } catch (error) {
      console.error('[Map Store] ❌ Failed to apply custom style:', error)
      console.error('[Map Store] Error stack:', error instanceof Error ? error.stack : error)
      // Fallback to default style
      applyDefaultMVTStyle(map, layer)
    }
  }

  /**
   * Apply default MVT styling (backward compatibility)
   */
  function applyDefaultMVTStyle(map: any, layer: Omit<MapLayer, 'createdAt'>) {
    // Check if source already exists and remove it first
    if (map.getSource(layer.id)) {
      // Remove all layers that use this source
      const allLayers = map.getStyle().layers
      allLayers.forEach((mapLayer: any) => {
        if (mapLayer.source === layer.id) {
          if (map.getLayer(mapLayer.id)) {
            map.removeLayer(mapLayer.id)
          }
        }
      })
      // Remove the source
      map.removeSource(layer.id)
    }
    
    // Convert relative URL to absolute URL for Mapbox GL JS
    const tilesUrl = layer.url.startsWith('http')
      ? layer.url
      : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}${layer.url}`

    map.addSource(layer.id, {
      type: 'vector',
      tiles: [tilesUrl],
      minzoom: layer.minZoom || 0,
      maxzoom: layer.maxZoom || 22
    })

    // Determine geometry type from metadata and map to appropriate layer type
    const geometryType = layer.metadata?.geometryType
    const sourceLayer = layer.sourceLayer || layer.metadata?.tableName || 'default'
    
    // Normalize geometry type (handle variations like 'polygon', 'POLYGON', etc.)
    const normalizedGeometryType = geometryType 
      ? geometryType.trim().toLowerCase().replace(/[_\s]/g, '')
      : 'polygon' // Default to polygon if not specified
    
    // Map geometry type to Mapbox layer type
    let layerType: 'circle' | 'line' | 'fill'
    if (normalizedGeometryType.includes('point')) {
      layerType = 'circle'
    } else if (normalizedGeometryType.includes('linestring')) {
      layerType = 'line'
    } else {
      // Polygon, MultiPolygon, or unknown - use fill
      layerType = 'fill'
    }
    
    // Add appropriate layer based on geometry type
    if (layerType === 'circle') {
      // Point geometry - use circle layer
      map.addLayer({
        id: layer.id,
        type: 'circle',
        source: layer.id,
        'source-layer': sourceLayer,
        paint: {
          'circle-radius': layer.style?.strokeWidth || 5,
          'circle-color': layer.style?.fillColor || '#409eff',
          'circle-opacity': layer.style?.fillOpacity || layer.opacity || 0.8
        }
      })
    } else if (layerType === 'line') {
      // Line geometry - use line layer
      map.addLayer({
        id: layer.id,
        type: 'line',
        source: layer.id,
        'source-layer': sourceLayer,
        paint: {
          'line-color': layer.style?.strokeColor || layer.style?.fillColor || '#409eff',
          'line-width': layer.style?.strokeWidth || 8,
          'line-opacity': layer.style?.fillOpacity || layer.opacity || 0.8
        }
      })
    } else {
      // Polygon geometry - use fill layer with outline
      map.addLayer({
        id: layer.id,
        type: 'fill',
        source: layer.id,
        'source-layer': sourceLayer,
        paint: {
          'fill-color': layer.style?.fillColor || '#409eff',
          'fill-opacity': layer.style?.fillOpacity || layer.opacity || 0.5
        }
      })
      
      // Add outline layer for polygons
      map.addLayer({
        id: `${layer.id}-outline`,
        type: 'line',
        source: layer.id,
        'source-layer': sourceLayer,
        paint: {
          'line-color': layer.style?.strokeColor || '#ffffff',
          'line-width': layer.style?.strokeWidth || 1,
          'line-opacity': 0.5
        }
      })
    }
  }

  /**
   * Add WMS/Image layer
   */
  function addWMSLayer(map: any, layer: Omit<MapLayer, 'createdAt'>) {
    if (map.getSource(layer.id)) {
      map.removeLayer(layer.id)
      map.removeSource(layer.id)
    }

    // Convert WMS service URL to tile URL template for Mapbox GL JS
    const baseUrl = layer.url.startsWith('http')
      ? layer.url
      : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}${layer.url}`

    // For WMS services, use the tile endpoint that converts XYZ to WMS GetMap
    const tilesUrl = `${baseUrl}/tile/{z}/{x}/{y}.png`
    
    // Check if layer has bounding box in metadata and auto-fit view
    const bbox = layer.metadata?.bbox
    if (bbox && Array.isArray(bbox) && bbox.length === 4) {
      const [minX, minY, maxX, maxY] = bbox
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      
      // Calculate appropriate zoom level based on extent
      const lonDiff = maxX - minX
      const latDiff = maxY - minY
      const maxDiff = Math.max(lonDiff, latDiff)
      
      // More aggressive zoom calculation for small datasets
      let targetZoom = 10  // Default to higher zoom
      if (maxDiff > 50) targetZoom = 4
      else if (maxDiff > 20) targetZoom = 5
      else if (maxDiff > 10) targetZoom = 6
      else if (maxDiff > 5) targetZoom = 7
      else if (maxDiff > 2) targetZoom = 8
      else if (maxDiff > 0.5) targetZoom = 10
      else if (maxDiff > 0.1) targetZoom = 11
      else targetZoom = 12
      
      // Immediately jump to the data extent (no animation) to ensure correct tile requests
      map.jumpTo({
        center: [centerX, centerY],
        zoom: targetZoom
      })
    } else {
      console.warn(`[Map Store] No bounding box found in layer metadata`)
    }

    map.addSource(layer.id, {
      type: 'raster',
      tiles: [tilesUrl],
      tileSize: 256,
      scheme: 'xyz'
    })

    map.addLayer({
      id: layer.id,
      type: 'raster',
      source: layer.id,
      paint: {
        'raster-opacity': layer.opacity || 1
      }
    })
  }

  /**
   * Add Heatmap layer
   */
  function addHeatmapLayer(map: any, layer: Omit<MapLayer, 'createdAt'>) {
    if (map.getSource(layer.id)) {
      map.removeLayer(layer.id)
      map.removeSource(layer.id)
    }

    map.addSource(layer.id, {
      type: 'geojson',
      data: layer.url
    })

    map.addLayer({
      id: layer.id,
      type: 'heatmap',
      source: layer.id,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': 1,
        'heatmap-radius': 10,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0, 0, 255, 0)',
          0.2, 'rgba(0, 255, 255, 1)',
          0.4, 'rgba(0, 255, 0, 1)',
          0.6, 'rgba(255, 255, 0, 1)',
          0.8, 'rgba(255, 128, 0, 1)',
          1, 'rgba(255, 0, 0, 1)'
        ]
      }
    })
  }

  return {
    addLayerToMap,
    addMVTLayer,
    addWMSLayer,
    addHeatmapLayer
  }
}
