import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MapLayer, BasemapType } from '@/types'
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
        visible: false, // Always default to invisible
        createdAt: new Date().toISOString()
      })
    }

    // Note: Layer won't be added to map initially since visible is false
    // User must manually toggle visibility to show the layer
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
      case 'geojson':
        addGeoJSONLayer(map, layer)
        break
      case 'mvt':
        addMVTLayer(map, layer)
        break
      case 'wms':
      case 'image':
        addWMSLayer(map, layer)
        break
      case 'heatmap':
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
      console.log('[Map Store] Custom style loaded:', styleJson)

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
        styleJson.layers.forEach((styleLayer: any) => {
          const layerToAdd: any = {
            id: styleLayer.id,
            type: styleLayer.type,
            source: layer.id,
            'source-layer': styleLayer['source-layer'] || 'default',
            paint: styleLayer.paint
          }
          
          if (styleLayer.minzoom !== undefined) layerToAdd.minzoom = styleLayer.minzoom
          if (styleLayer.maxzoom !== undefined) layerToAdd.maxzoom = styleLayer.maxzoom
          if (styleLayer.layout) layerToAdd.layout = styleLayer.layout
          if (styleLayer.filter) layerToAdd.filter = styleLayer.filter
          
          if (!map.getLayer(layerToAdd.id)) {
            try {
              map.addLayer(layerToAdd)
            } catch (error) {
              console.error(`[Map Store] Failed to add layer ${layerToAdd.id}:`, error)
            }
          }
        })
      }

      console.log('[Map Store] Custom style applied successfully')
    } catch (error) {
      console.error('[Map Store] Failed to apply custom style:', error)
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
    layers.value.forEach(layer => {
      if (mapInstance.value) {
        if (mapInstance.value.getLayer(layer.id)) {
          mapInstance.value.removeLayer(layer.id)
        }
        if (mapInstance.value.getSource(layer.id)) {
          mapInstance.value.removeSource(layer.id)
        }
      }
    })
    layers.value = []
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
    let layerType: 'geojson' | 'mvt' | 'wms' | 'heatmap' | 'image'
    
    if (service.type === 'mvt') {
      layerType = 'mvt'
    } else if (service.type === 'wms' || service.type === 'image') {
      layerType = 'image'
    } else {
      console.warn(`[Map Store] Unsupported service type: ${service.type}`)
      return
    }

    const layer: Omit<MapLayer, 'createdAt'> = {
      id: service.id,
      type: layerType,
      url: service.url,
      visible: true, // Auto-show layers added from chat
      opacity: 0.8,
      metadata: service.metadata,
      name: service.metadata?.name || service.id,
      style: {
        fillColor: '#409eff',
        fillOpacity: 0.6
      }
    }

    // Add to store
    addLayer(layer)

    // If layer should be visible, add it to map immediately
    if (layer.visible && mapInstance.value) {
      addLayerToMap(layer)
    }
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
    addLayerFromService
  }
})
