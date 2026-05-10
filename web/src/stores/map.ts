import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MapLayer, BasemapType } from '@/types'
import { LayerType } from '@/types'
import { createStyleFromBasemap } from '@/config/basemaps'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { StyleFactory } from '../utils/StyleFactory'
import { GeometryAdapter } from '../utils/GeometryAdapter'

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
    const styleUrl = layer.styleUrl || layer.metadata?.styleUrl
    console.log('[Map Store] addMVTLayer - layer:', layer.id)
    console.log('[Map Store] addMVTLayer - metadata:', layer.metadata)
    console.log('[Map Store] addMVTLayer - styleUrl:', styleUrl)
    
    if (styleUrl) {
      console.log('[Map Store] Detected custom style, applying...')
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
      console.log('[Map Store] === applyCustomStyleFromURL START ===')
      console.log('[Map Store] Layer ID:', layer.id)
      console.log('[Map Store] Style URL:', styleUrl)
      
      // Check if source already exists and remove it first
      if (map.getSource(layer.id)) {
        console.log('[Map Store] Source already exists, removing old layers and source...')
        // Remove all layers that use this source
        const allLayers = map.getStyle().layers
        allLayers.forEach((mapLayer: any) => {
          if (mapLayer.source === layer.id && mapLayer.id !== layer.id) {
            if (map.getLayer(mapLayer.id)) {
              map.removeLayer(mapLayer.id)
              console.log('[Map Store] Removed old layer:', mapLayer.id)
            }
          }
        })
        // Remove the source
        map.removeSource(layer.id)
        console.log('[Map Store] Removed old source:', layer.id)
      }
      
      // Convert relative URL to absolute (but NOT for blob URLs)
      const fullStyleUrl = styleUrl.startsWith('http') || styleUrl.startsWith('blob:')
        ? styleUrl
        : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}${styleUrl}`

      console.log(`[Map Store] Loading custom style from: ${fullStyleUrl}`)

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
      // console.log('[Map Store] Style JSON loaded:', JSON.stringify(styleJson, null, 2))

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
      
      console.log('[Map Store] Source added successfully')
      console.log('[Map Store] Verifying source exists:', !!map.getSource(layer.id))

      // Add layers from style JSON
      if (styleJson.layers && Array.isArray(styleJson.layers)) {
        console.log(`[Map Store] Processing ${styleJson.layers.length} layers from style`)
        
        const addedLayerIds: string[] = [];
        
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
          
          try {
            map.addLayer(layerToAdd)
            addedLayerIds.push(styleLayer.id)
            console.log(`[Map Store] ✅ Layer added successfully: ${styleLayer.id}`)
          } catch (error) {
            console.error(`[Map Store] ❌ Failed to add layer ${styleLayer.id}:`, error)
          }
        })

        // Update the layer record in store to reflect the actual layer IDs in the map
        if (addedLayerIds.length > 0) {
          const layerIndex = layers.value.findIndex(l => l.id === layer.id)
          if (layerIndex !== -1) {
            // Store the actual sub-layer IDs in metadata for querying
            layers.value[layerIndex].metadata = {
              ...layers.value[layerIndex].metadata,
              actualLayerIds: addedLayerIds
            }
            console.log(`[Map Store] Updated layer metadata with actualLayerIds:`, addedLayerIds)
          }
        }
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
    // Check if source already exists and remove it first
    if (map.getSource(layer.id)) {
      console.log('[Map Store] Default style - Source already exists, removing...')
      // Remove all layers that use this source
      const allLayers = map.getStyle().layers
      allLayers.forEach((mapLayer: any) => {
        if (mapLayer.source === layer.id) {
          if (map.getLayer(mapLayer.id)) {
            map.removeLayer(mapLayer.id)
            console.log('[Map Store] Removed old layer:', mapLayer.id)
          }
        }
      })
      // Remove the source
      map.removeSource(layer.id)
      console.log('[Map Store] Removed old source:', layer.id)
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
          'line-width': layer.style?.strokeWidth || 2,
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
    // The {z}/{x}/{y} placeholders will be replaced by MapLibre with actual tile coordinates
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
      else if (maxDiff > 0.5) targetZoom = 10  // Changed from 9 to 10
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

    // Extract style configuration from metadata if available
    const styleConfig = service.metadata?.styleConfig
    
    // If styleConfig is provided, use StyleFactory to generate Mapbox style JSON
    if (styleConfig) {
      console.log('[Map Store] Applying styleConfig via StyleFactory:', styleConfig)
      
      // Get geometry type from metadata
      const geometryType = service.metadata?.geometryType
        ? GeometryAdapter.normalizeGeometryType(service.metadata.geometryType)
        : undefined
      
      // Generate style based on type
      let styleUrl: string | null = null
      
      switch (styleConfig.type) {
        case 'uniform':
          // Use StyleFactory to generate uniform style with geometry-aware rendering
          StyleFactory.generateUniformStyle({
            tilesetId: service.id,
            layerName: styleConfig.layerName || 'default',
            color: styleConfig.color || '#3388ff',
            strokeWidth: styleConfig.strokeWidth || 2,
            pointSize: 5,
            opacity: styleConfig.opacity || 0.8,
            geometryType,
            minZoom: 0,
            maxZoom: 22
          }).then(style => {
            // Save style as blob URL for immediate use
            const blob = new Blob([JSON.stringify(style)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            
            // Add layer with custom style
            const layer: Omit<MapLayer, 'createdAt'> = {
              id: service.id,
              type: layerType,
              url: service.url,
              visible: true,
              opacity: styleConfig.opacity || 0.8,
              metadata: service.metadata,
              name: service.metadata?.name || service.id,
              styleUrl: url // Use generated style URL
            }
            
            addLayer(layer)
          }).catch(error => {
            console.error('[Map Store] Failed to generate uniform style:', error)
            // Fallback to default styling
            const layer: Omit<MapLayer, 'createdAt'> = {
              id: service.id,
              type: layerType,
              url: service.url,
              visible: true,
              opacity: 0.8,
              metadata: service.metadata,
              name: service.metadata?.name || service.id
            }
            addLayer(layer)
          })
          return // Async operation, return early
          
        case 'choropleth':
          // Use StyleFactory for choropleth rendering
          StyleFactory.generateChoroplethStyle({
            tilesetId: service.id,
            layerName: styleConfig.layerName || 'default',
            valueField: styleConfig.valueField,
            breaks: styleConfig.breaks,
            colorRamp: styleConfig.colorRamp || 'blues',
            numClasses: styleConfig.numClasses || styleConfig.breaks.length - 1,
            opacity: styleConfig.opacity || 0.8,
            geometryType,
            minZoom: 0,
            maxZoom: 22
          }).then(style => {
            const blob = new Blob([JSON.stringify(style)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            
            const layer: Omit<MapLayer, 'createdAt'> = {
              id: service.id,
              type: layerType,
              url: service.url,
              visible: true,
              opacity: styleConfig.opacity || 0.8,
              metadata: service.metadata,
              name: service.metadata?.name || service.id,
              styleUrl: url
            }
            
            addLayer(layer)
          }).catch(error => {
            console.error('[Map Store] Failed to generate choropleth style:', error)
            // Fallback
            const layer: Omit<MapLayer, 'createdAt'> = {
              id: service.id,
              type: layerType,
              url: service.url,
              visible: true,
              opacity: 0.8,
              metadata: service.metadata,
              name: service.metadata?.name || service.id
            }
            addLayer(layer)
          })
          return
          
        case 'categorical':
          // Use StyleFactory for categorical rendering
          StyleFactory.generateCategoricalStyle({
            tilesetId: service.id,
            layerName: styleConfig.layerName || 'default',
            categoryField: styleConfig.categoryField,
            categories: styleConfig.categories || [],
            colorScheme: styleConfig.colorPalette || 'set1',
            opacity: styleConfig.opacity || 0.8,
            geometryType,
            minZoom: 0,
            maxZoom: 22
          }).then(style => {
            const blob = new Blob([JSON.stringify(style)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            
            const layer: Omit<MapLayer, 'createdAt'> = {
              id: service.id,
              type: layerType,
              url: service.url,
              visible: true,
              opacity: styleConfig.opacity || 0.8,
              metadata: service.metadata,
              name: service.metadata?.name || service.id,
              styleUrl: url
            }
            
            addLayer(layer)
          }).catch(error => {
            console.error('[Map Store] Failed to generate categorical style:', error)
            // Fallback
            const layer: Omit<MapLayer, 'createdAt'> = {
              id: service.id,
              type: layerType,
              url: service.url,
              visible: true,
              opacity: 0.8,
              metadata: service.metadata,
              name: service.metadata?.name || service.id
            }
            addLayer(layer)
          })
          return
          
        case 'heatmap':
          // Use StyleFactory for heatmap rendering
          const heatmapStyle = StyleFactory.generateHeatmapStyle({
            tilesetId: service.id,
            layerName: styleConfig.layerName || 'default',
            radius: styleConfig.radius || 30,
            intensity: styleConfig.intensity || 1,
            minZoom: 0,
            maxZoom: 22
          })
          
          const blob = new Blob([JSON.stringify(heatmapStyle)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          
          const layer: Omit<MapLayer, 'createdAt'> = {
            id: service.id,
            type: LayerType.Heatmap,
            url: service.url,
            visible: true,
            opacity: 0.8,
            metadata: service.metadata,
            name: service.metadata?.name || service.id,
            styleUrl: url
          }
          
          addLayer(layer)
          return
          
        default:
          console.warn(`[Map Store] Unknown styleConfig type: ${styleConfig.type}`)
      }
    }

    // Default: no styleConfig, use simple styling
    const layer: Omit<MapLayer, 'createdAt'> = {
      id: service.id,
      type: layerType,
      url: service.url,
      visible: true,
      opacity: 0.8,
      metadata: service.metadata,
      name: service.metadata?.name || service.id
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
        
        // Filter out layers that don't actually exist in the current style
        let layersToQueryFinal = layersToQuery;
        
        // If we have actualLayerIds from custom style, use those instead
        if (layer.metadata?.actualLayerIds && layer.metadata.actualLayerIds.length > 0) {
          layersToQueryFinal = layer.metadata.actualLayerIds;
        }
        
        const existingLayers = layersToQueryFinal.filter(id => map.getLayer(id))
        
        if (existingLayers.length === 0) {
          console.warn(`[Map Store] No valid layers found for query: ${layer.id}`)
          return
        }
        
        // Use MapLibre's queryRenderedFeatures
        const features = map.queryRenderedFeatures(bbox, {
          layers: existingLayers
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
