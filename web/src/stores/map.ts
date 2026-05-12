import { defineStore } from 'pinia'
import { createMapState } from './mapImpl/state'
import { useMapCore } from './mapImpl/map-core'
import { useLayerRenderers } from './mapImpl/layer-renderers'
import { useLayerManager } from './mapImpl/layer-manager'
import { useServiceIntegration } from './mapImpl/service-integration'

/**
 * Map Store - Modularized Version
 * 
 * This store has been refactored into modular components:
 * - state.ts: Centralized state management
 * - map-core.ts: Map initialization and navigation
 * - layer-renderers.ts: Layer rendering logic (MVT, WMS, Heatmap)
 * - layer-manager.ts: Layer CRUD operations
 * - service-integration.ts: Backend service integration
 */
export const useMapStore = defineStore('map', () => {
  // Initialize state
  const state = createMapState()
  
  // Initialize core map operations
  const core = useMapCore(state)
  
  // Initialize layer renderers
  const renderers = useLayerRenderers(state)
  
  // Initialize layer manager (depends on renderers)
  const layerManager = useLayerManager(state, renderers)
  
  // Initialize service integration (depends on layer manager)
  const serviceIntegration = useServiceIntegration(state, layerManager)
  
  // Return all state and actions
  return {
    // State
    layers: state.layers,
    basemap: state.basemap,
    center: state.center,
    zoom: state.zoom,
    mapInstance: state.mapInstance,
    mapContainer: state.mapContainer,
    
    // Computed
    visibleLayers: core.visibleLayers,
    
    // Map Core Actions
    initializeMap: core.initializeMap,
    setBasemap: core.setBasemap,
    flyTo: core.flyTo,
    
    // Layer Management Actions
    addLayer: layerManager.addLayer,
    removeLayer: layerManager.removeLayer,
    toggleLayerVisibility: layerManager.toggleLayerVisibility,
    setLayerOpacity: layerManager.setLayerOpacity,
    clearAllLayers: layerManager.clearAllLayers,
    
    // Service Integration Actions
    addLayerFromService: serviceIntegration.addLayerFromService,
    queryFeaturesAtPoint: serviceIntegration.queryFeaturesAtPoint
  }
})
