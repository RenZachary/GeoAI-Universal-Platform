import type { MapLayer } from '@/types'
import type { MapState } from './state'
import { useLayerRenderers } from './layer-renderers'

/**
 * Layer Manager
 * Handles layer CRUD operations and visibility management
 */
export function useLayerManager(
  state: MapState,
  renderers: ReturnType<typeof useLayerRenderers>
) {
  /**
   * Add a new layer or update existing one
   */
  function addLayer(layer: Omit<MapLayer, 'createdAt'>) {
    const existing = state.layers.value?.find(l => l.id === layer.id)
    if (existing) {
      Object.assign(existing, layer)
    } else {
      state.layers.value?.push({
        ...layer,
        visible: layer.visible !== undefined ? layer.visible : false,
        createdAt: new Date().toISOString()
      })
    }

    // If layer is visible, add it to map
    if (layer.visible && state.mapInstance.value) {
      renderers.addLayerToMap(layer)
    }
  }

  /**
   * Remove a layer
   */
  function removeLayer(layerId: string) {
    const index = (state.layers.value || []).findIndex(l => l.id === layerId)
    if (index !== -1 && state.layers.value) {
      state.layers.value.splice(index, 1)

      // Remove from map
      if (state.mapInstance.value) {
        if (state.mapInstance.value.getLayer(layerId)) {
          state.mapInstance.value.removeLayer(layerId)
        }
        if (state.mapInstance.value.getSource(layerId)) {
          state.mapInstance.value.removeSource(layerId)
        }
      }
    }
  }

  /**
   * Toggle layer visibility
   */
  function toggleLayerVisibility(layerId: string) {
    const layer = state.layers.value?.find(l => l.id === layerId)
    if (layer) {
      layer.visible = !layer.visible

      if (state.mapInstance.value) {
        if (layer.visible) {
          renderers.addLayerToMap(layer)
        } else {
          if (state.mapInstance.value.getLayer(layerId)) {
            state.mapInstance.value.setLayoutProperty(layerId, 'visibility', 'none')
          }
        }
      }
    }
  }

  /**
   * Set layer opacity
   */
  function setLayerOpacity(layerId: string, opacity: number) {
    const layer = state.layers.value?.find(l => l.id === layerId)
    if (layer && state.mapInstance.value) {
      layer.opacity = opacity

      if (state.mapInstance.value.getLayer(layerId)) {
        state.mapInstance.value.setPaintProperty(layerId, 'raster-opacity', opacity)
      }
    }
  }

  /**
   * Clear all service layers (keep data source layers)
   */
  function clearAllLayers() {
    if (!state.mapInstance.value) return
    
    const map = state.mapInstance.value
    
    // Remove dynamically generated service layers (no dataSourceId)
    // Keep original data layers (have dataSourceId)
    const layersToRemove = (state.layers.value || []).filter(layer => !layer.dataSourceId)
    const layersToKeep = (state.layers.value || []).filter(layer => layer.dataSourceId)
        
    // STEP 1: Remove ALL layers first (before removing any sources)
    layersToRemove.forEach(layer => {
      try {
        if (map.getLayer(layer.id)) {
          map.removeLayer(layer.id)
        }
      } catch (error) {
        console.warn(`Failed to remove layer ${layer.id}:`, error)
      }
    })
    
    // Also remove any custom style layers that might have been added
    const allLayers = map.getStyle().layers
    allLayers.forEach((mapLayer: any) => {
      // Skip basemap layer
      if (mapLayer.id === 'basemap-layer') return
      
      // Check if this is a custom style layer (not in our layers array)
      const isInOurLayers = (state.layers.value || []).some(l => l.id === mapLayer.id)
      if (!isInOurLayers) {
        try {
          map.removeLayer(mapLayer.id)
        } catch (error) {
          // Ignore errors for layers we can't remove
        }
      }
    })
    
    // STEP 2: Now remove ALL sources (after all layers are removed)
    layersToRemove.forEach(layer => {
      try {
        if (map.getSource(layer.id)) {
          map.removeSource(layer.id)
        }
      } catch (error) {
        console.warn(`Failed to remove source ${layer.id}:`, error)
      }
    })
    
    // Remove service layers from the layers array
    state.layers.value = layersToKeep
  }

  return {
    addLayer,
    removeLayer,
    toggleLayerVisibility,
    setLayerOpacity,
    clearAllLayers
  }
}
