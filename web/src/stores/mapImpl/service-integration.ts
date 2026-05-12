import type { MapLayer } from '@/types'
import { LayerType } from '@/types'
import type { MapState } from './state'
import { StyleFactory } from '../../utils/StyleFactory'
import { GeometryAdapter } from '../../utils/GeometryAdapter'

/**
 * Service Integration
 * Handles integration with backend visualization services
 */
export function useServiceIntegration(
  state: MapState,
  layerManager: ReturnType<typeof import('./layer-manager').useLayerManager>
) {
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
    if ((state.layers.value || []).some(l => l.id === service.id)) {
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
          }).then((style: any) => {
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
            
            layerManager.addLayer(layer)
          }).catch((error: any) => {
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
            layerManager.addLayer(layer)
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
          }).then((style: any) => {
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
            
            layerManager.addLayer(layer)
          }).catch((error: any) => {
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
            layerManager.addLayer(layer)
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
          }).then((style: any) => {
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
            
            layerManager.addLayer(layer)
          }).catch((error: any) => {
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
            layerManager.addLayer(layer)
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
          
          layerManager.addLayer(layer)
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
    layerManager.addLayer(layer)
  }

  /**
   * Query features at a specific point on the map
   * Returns features from all visible MVT and GeoJSON layers
   */
  function queryFeaturesAtPoint(lngLat: [number, number], radius: number = 5): Array<{ layerId: string; layerName?: string; properties: Record<string, any> }> {
    if (!state.mapInstance.value) return []

    const map = state.mapInstance.value
    const results: Array<{ layerId: string; layerName?: string; properties: Record<string, any> }> = []

    // Get all visible layers that can be queried
    const queryableLayers = (state.layers.value || []).filter(layer => 
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
    addLayerFromService,
    queryFeaturesAtPoint
  }
}
