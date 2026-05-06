import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MapLayer, BasemapType } from '@/types'
import { LayerType } from '@/types'
import { createStyleFromBasemap } from '@/config/basemaps'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export const useMapStore = defineStore('map', () => {
  // State
  const layers = ref<MapLayer[]>([])
  const basemap = ref<BasemapType>('esriStreet')
  const center = ref<[number, number]>([104.0, 35.0])
  const zoom = ref(3)

  // Map instance reference
  const mapInstance = ref<any>(null)
  const mapContainer = ref<HTMLElement | null>(null)

  // Computed
  const visibleLayers = computed<MapLayer[]>(() => layers.value.filter(l => l.visible))

  // Actions
  function initializeMap(containerId: string) {
    if (mapInstance.value) {
      mapInstance.value.remove()
    }

    const style = createStyleFromBasemap(basemap.value)

    mapInstance.value = new maplibregl.Map({
      container: containerId,
      style: style,
      center: center.value,
      zoom: zoom.value
    })

    // Add navigation controls
    mapInstance.value.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapInstance.value.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    // Listen for map events
    mapInstance.value.on('move', () => {
      if (mapInstance.value) {
        const lngLat = mapInstance.value.getCenter()
        center.value = [lngLat.lng, lngLat.lat]
        zoom.value = mapInstance.value.getZoom()
      }
    })

    return mapInstance.value
  }

  function setBasemap(type: BasemapType) {
    basemap.value = type

    if (mapInstance.value) {
      const style = createStyleFromBasemap(type)
      mapInstance.value.setStyle(style)
    }
  }

  function flyTo(location: { center: [number, number]; zoom?: number }) {
    if (mapInstance.value) {
      mapInstance.value.flyTo({
        center: location.center,
        zoom: location.zoom || zoom.value,
        essential: true
      })
    }
  }

  function addLayer(layer: Omit<MapLayer, 'createdAt'>) {
    const existing = layers.value.find(l => l.id === layer.id)
    if (existing) {
      Object.assign(existing, layer)
    } else {
      layers.value.push({
        ...layer,
        visible: layer.visible !== undefined ? layer.visible : false,
        createdAt: new Date().toISOString()
      })
    }

    // If layer is visible, add it to map
    if (layer.visible && mapInstance.value) {
      addLayerToMap(layer)
    }
  }

  function removeLayer(layerId: string) {
    const index = layers.value.findIndex(l => l.id === layerId)
    if (index !== -1) {
      layers.value.splice(index, 1)

      // Remove from map
      if (mapInstance.value) {
        if (mapInstance.value.getLayer(layerId)) {
          mapInstance.value.removeLayer(layerId)
        }
        if (mapInstance.value.getSource(layerId)) {
          mapInstance.value.removeSource(layerId)
        }
      }
    }
  }

  function toggleLayerVisibility(layerId: string) {
    const layer = layers.value.find(l => l.id === layerId)
    if (layer) {
      layer.visible = !layer.visible

      if (mapInstance.value) {
        if (layer.visible) {
          addLayerToMap(layer)
        } else {
          if (mapInstance.value.getLayer(layerId)) {
            mapInstance.value.setLayoutProperty(layerId, 'visibility', 'none')
          }
        }
      }
    }
  }

  function setLayerOpacity(layerId: string, opacity: number) {
    const layer = layers.value.find(l => l.id === layerId)
    if (layer && mapInstance.value) {
      layer.opacity = opacity

      if (mapInstance.value.getLayer(layerId)) {
        mapInstance.value.setPaintProperty(layerId, 'raster-opacity', opacity)
      }
    }
  }

  // Private helper to add layer to map based on type
  function addLayerToMap(layer: Omit<MapLayer, 'createdAt'>) {
    if (!mapInstance.value) return

    const map = mapInstance.value as any

    switch (layer.type) {
      case LayerType.GeoJSON:
        addGeoJSONLayer(map, layer)
        break
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

  function addGeoJSONLayer(map: any, layer: Omit<MapLayer, 'createdAt'>) {
    if (map.getSource(layer.id)) {
      map.removeLayer(layer.id)
      map.removeSource(layer.id)
    }

    // Convert relative URL to absolute URL for Mapbox GL JS
    const dataUrl = layer.url.startsWith('http')
      ? layer.url
      : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}${layer.url}`

    map.addSource(layer.id, {
      type: 'geojson',
      data: dataUrl
    })

    map.addLayer({
      id: layer.id,
      type: 'fill',
      source: layer.id,
      paint: {
        'fill-color': layer.style?.fillColor || '#409eff',
        'fill-opacity': layer.style?.fillOpacity || layer.opacity || 0.5
      }
    })
  }

  function addMVTLayer(map: any, layer: Omit<MapLayer, 'createdAt'>) {
    if (map.getSource(layer.id)) {
      map.removeLayer(layer.id)
      map.removeSource(layer.id)
    }

    // Check if this is a choropleth/thematic map with custom style
    const styleUrl = layer.metadata?.styleUrl
    console.log('[Map Store] addMVTLayer - layer:', layer.id)
    console.log('[Map Store] addMVTLayer - metadata:', layer.metadata)
    console.log('[Map Store] addMVTLayer - styleUrl:', styleUrl)
    
    if (styleUrl) {
      console.log('[Map Store] Detected custom style, applying...')
      // Apply custom style from backend
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
      console.log('[Map Store] === applyCustomStyleFromURL START ===')
      console.log('[Map Store] Layer ID:', layer.id)
      console.log('[Map Store] Style URL:', styleUrl)
      
      // Convert relative URL to absolute
      const fullStyleUrl = styleUrl.startsWith('http')
        ? styleUrl
        : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}${styleUrl}`

      console.log(`[Map Store] Loading custom style from: ${fullStyleUrl}`)

      // Fetch the style JSON
      const response = await fetch(fullStyleUrl)
      if (!response.ok) {
        throw new Error(`Failed to load style: ${response.status} ${response.statusText}`)
      }

      const styleJson = await response.json()
      console.log('[Map Store] Style JSON loaded:', JSON.stringify(styleJson, null, 2))

      // Add vector source
      const tilesUrl = layer.url.startsWith('http')
        ? layer.url
        : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}${layer.url}`

      console.log('[Map Store] Tiles URL:', tilesUrl)
      console.log('[Map Store] Adding source with ID:', layer.id)
      
      map.addSource(layer.id, {
        type: 'vector',
        tiles: [tilesUrl],
        minzoom: layer.minZoom || 0,
        maxzoom: layer.maxZoom || 22
      })
      
      console.log('[Map Store] Source added successfully')
      console.log('[Map Store] Verifying source exists:', !!map.getSource(layer.id))

      // Add layers from style JSON
      if (styleJson.layers && Array.isArray(styleJson.layers)) {
        console.log(`[Map Store] Processing ${styleJson.layers.length} layers from style`)
        
        styleJson.layers.forEach((styleLayer: any, index: number) => {
          console.log(`\n[Map Store] --- Layer ${index + 1} ---`)
          
          const layerToAdd: any = {
            id: styleLayer.id,
            type: styleLayer.type,
            source: layer.id,
            'source-layer': styleLayer['source-layer'] || 'default',
            paint: styleLayer.paint
          }
          
          console.log('[Map Store] Layer to add - ID:', layerToAdd.id)
          console.log('[Map Store] Layer to add - Type:', layerToAdd.type)
          console.log('[Map Store] Layer to add - Source:', layerToAdd.source)
          console.log('[Map Store] Layer to add - Source-layer:', layerToAdd['source-layer'])
          console.log('[Map Store] Layer to add - Paint:', JSON.stringify(layerToAdd.paint))
          
          if (styleLayer.minzoom !== undefined) {
            layerToAdd.minzoom = styleLayer.minzoom
            console.log('[Map Store] Layer to add - Minzoom:', layerToAdd.minzoom)
          }
          if (styleLayer.maxzoom !== undefined) {
            layerToAdd.maxzoom = styleLayer.maxzoom
            console.log('[Map Store] Layer to add - Maxzoom:', layerToAdd.maxzoom)
          }
          if (styleLayer.layout) {
            layerToAdd.layout = styleLayer.layout
            console.log('[Map Store] Layer to add - Layout:', JSON.stringify(layerToAdd.layout))
          }
          if (styleLayer.filter) {
            layerToAdd.filter = styleLayer.filter
            console.log('[Map Store] Layer to add - Filter:', JSON.stringify(layerToAdd.filter))
          }
          
          const layerExists = map.getLayer(layerToAdd.id)
          console.log('[Map Store] Layer already exists?', !!layerExists)
          
          if (!layerExists) {
            try {
              console.log('[Map Store] Attempting to add layer...')
              map.addLayer(layerToAdd)
              console.log('[Map Store] ✅ Layer added successfully')
              
              // Verify layer was added
              const addedLayer = map.getLayer(layerToAdd.id)
              console.log('[Map Store] Verified layer exists:', !!addedLayer)
            } catch (error) {
              console.error(`[Map Store] ❌ Failed to add layer ${layerToAdd.id}:`, error)
              console.error('[Map Store] Error details:', error instanceof Error ? error.message : error)
            }
          } else {
            console.warn('[Map Store] ⚠️  Layer already exists, skipping')
          }
        })
      } else {
        console.warn('[Map Store] No layers found in style JSON')
      }

      console.log('[Map Store] === applyCustomStyleFromURL END ===')
      console.log('[Map Store] Custom style applied successfully')
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

    map.addLayer({
      id: layer.id,
      type: 'fill',
      source: layer.id,
      'source-layer': layer.sourceLayer || 'default',
      paint: {
        'fill-color': layer.style?.fillColor || '#409eff',
        'fill-opacity': layer.style?.fillOpacity || layer.opacity || 0.5
      }
    })
  }

  function addWMSLayer(map: any, layer: Omit<MapLayer, 'createdAt'>) {
    if (map.getSource(layer.id)) {
      map.removeLayer(layer.id)
      map.removeSource(layer.id)
    }

    // Convert relative URL to absolute URL for Mapbox GL JS
    const tilesUrl = layer.url.startsWith('http')
      ? layer.url
      : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}${layer.url}`

    map.addSource(layer.id, {
      type: 'raster',
      tiles: [tilesUrl],
      tileSize: 256
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

  function clearAllLayers() {
    if (!mapInstance.value) return
    
    const map = mapInstance.value
    
    // Remove dynamically generated service layers (no dataSourceId)
    // Keep original data layers (have dataSourceId)
    const layersToRemove = layers.value.filter(layer => !layer.dataSourceId)
    const layersToKeep = layers.value.filter(layer => layer.dataSourceId)
    
    console.log(`[Map Store] Clearing ${layersToRemove.length} service layers, keeping ${layersToKeep.length} data layers`)
    
    // First, remove all service layers from the map
    layersToRemove.forEach(layer => {
      try {
        if (map.getLayer(layer.id)) {
          map.removeLayer(layer.id)
        }
        if (map.getSource(layer.id)) {
          map.removeSource(layer.id)
        }
      } catch (error) {
        console.warn(`Failed to remove layer ${layer.id}:`, error)
      }
    })
    
    // Also remove any custom style layers that might have been added (e.g., choropleth fill/outline)
    const allLayers = map.getStyle().layers
    allLayers.forEach((mapLayer: any) => {
      // Skip basemap layer
      if (mapLayer.id === 'basemap-layer') return
      
      // Check if this is a custom style layer (not in our layers array)
      const isInOurLayers = layers.value.some(l => l.id === mapLayer.id)
      if (!isInOurLayers) {
        try {
          map.removeLayer(mapLayer.id)
        } catch (error) {
          // Ignore errors for layers we can't remove
        }
      }
    })
    
    // Remove service layers from the layers array
    layers.value = layersToKeep
    
    console.log(`[Map Store] Remaining layers: ${layers.value.length}`)
  }

  /**
   * Add layer from visualization service (MVT/WMS/Image)
   * This is the main entry point for chat-to-map integration
   */
  function addLayerFromService(service: any) {
    // Validate service data
    if (!service.url || !service.type) {
      console.error('[Map Store] Invalid service:', service)
      return
    }

    // Check if layer already exists
    if (layers.value.some(l => l.id === service.id)) {
      console.warn(`[Map Store] Layer ${service.id} already exists`)
      return
    }

    // Convert service type to map layer type
    let layerType: LayerType
    
    if (service.type === 'mvt') {
      layerType = LayerType.MVT
    } else if (service.type === 'wms' || service.type === 'image') {
      layerType = LayerType.Image
    } else {
      console.warn(`[Map Store] Unsupported service type: ${service.type}`)
      return
    }

    const layer: Omit<MapLayer, 'createdAt'> = {
      id: service.id,
      type: layerType,
      url: service.url,
      visible: true,
      opacity: 0.8,
      metadata: service.metadata,
      name: service.metadata?.name || service.id,
      style: {
        fillColor: '#409eff',
        fillOpacity: 0.6
      }
    }

    // Add to store (will automatically add to map if visible)
    addLayer(layer)
  }

  /**
   * Query features at a specific point on the map
   * Returns features from all visible MVT and GeoJSON layers
   */
  function queryFeaturesAtPoint(lngLat: [number, number], radius: number = 5): Array<{ layerId: string; layerName?: string; properties: Record<string, any> }> {
    if (!mapInstance.value) return []

    const map = mapInstance.value
    const results: Array<{ layerId: string; layerName?: string; properties: Record<string, any> }> = []

    // Get all visible layers that can be queried
    const queryableLayers = layers.value.filter(layer => 
      layer.visible && (layer.type === LayerType.MVT || layer.type === LayerType.GeoJSON)
    )

    if (queryableLayers.length === 0) return []

    // Convert lng/lat to pixel coordinates
    const point = map.project(lngLat)
    const bbox: [number, number, number, number] = [
      point.x - radius,
      point.y - radius,
      point.x + radius,
      point.y + radius
    ]

    // Query features from each layer
    queryableLayers.forEach(layer => {
      try {
        // For MVT layers with custom styles, we need to query all sub-layers
        let layersToQuery: string[] = [layer.id]
        
        // Check if this layer has custom style sub-layers
        if (layer.metadata?.styleUrl) {
          // Get all layers in the map style that use this source
          const allStyleLayers = map.getStyle().layers
          const subLayers = allStyleLayers
            .filter((l: any) => l.source === layer.id && l.id !== layer.id)
            .map((l: any) => l.id)
          
          if (subLayers.length > 0) {
            layersToQuery = subLayers
            // console.log(`[Map Store] Querying ${subLayers.length} sub-layers for ${layer.id}`)
          }
        }
        
        // Use MapLibre's queryRenderedFeatures
        const features = map.queryRenderedFeatures(bbox, {
          layers: layersToQuery
        })

        if (features && features.length > 0) {
          features.forEach((feature: any) => {
            // Avoid duplicates - check if we already have this feature
            const isDuplicate = results.some(r => 
              r.layerId === layer.id && 
              JSON.stringify(r.properties) === JSON.stringify(feature.properties)
            )
            
            if (!isDuplicate) {
              results.push({
                layerId: layer.id,
                layerName: layer.name || layer.id,
                properties: feature.properties || {}
              })
            }
          })
        }
      } catch (error) {
        console.warn(`[Map Store] Failed to query features from layer ${layer.id}:`, error)
      }
    })

    return results
  }

  return {
    layers,
    basemap,
    center,
    zoom,
    mapInstance,
    mapContainer,
    visibleLayers,
    initializeMap,
    setBasemap,
    flyTo,
    addLayer,
    removeLayer,
    toggleLayerVisibility,
    setLayerOpacity,
    clearAllLayers,
    addLayerFromService,
    queryFeaturesAtPoint
  }
})
