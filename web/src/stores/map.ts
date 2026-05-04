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
  const mapInstance = ref<maplibregl.Map | null>(null)
  const mapContainer = ref<HTMLElement | null>(null)
  
  // Computed
  const visibleLayers = computed(() => layers.value.filter(l => l.visible))
  
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
    
    map.addSource(layer.id, {
      type: 'geojson',
      data: layer.url
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
    
    map.addSource(layer.id, {
      type: 'vector',
      tiles: [layer.url],
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
    
    map.addSource(layer.id, {
      type: 'raster',
      tiles: [layer.url],
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
    clearAllLayers
  }
})
