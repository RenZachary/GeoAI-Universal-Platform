import { computed } from 'vue'
import type { MapLayer } from '@/types'
import type { MapState } from './state'
import { createStyleFromBasemap } from '@/config/basemaps'
import maplibregl from 'maplibre-gl'

/**
 * Map Core Operations
 * Handles map initialization, basemap switching, and navigation
 */
export function useMapCore(state: MapState) {
  /**
   * Initialize the map instance
   */
  function initializeMap(containerId: string) {
    if (state.mapInstance.value) {
      state.mapInstance.value.remove()
    }

    const style = createStyleFromBasemap(state.basemap.value as any)

    state.mapInstance.value = new maplibregl.Map({
      container: containerId,
      style: style,
      center: state.center.value,
      zoom: state.zoom.value
    })

    // Add navigation controls
    state.mapInstance.value.addControl(new maplibregl.NavigationControl(), 'top-right')
    state.mapInstance.value.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    // Listen for map events
    state.mapInstance.value.on('move', () => {
      if (state.mapInstance.value) {
        const lngLat = state.mapInstance.value.getCenter()
        state.center.value = [lngLat.lng, lngLat.lat]
        state.zoom.value = state.mapInstance.value.getZoom()
        
        // Update viewport bbox
        updateViewportBbox()
      }
    })
    
    // Initial viewport bbox
    setTimeout(() => {
      updateViewportBbox()
    }, 100)

    return state.mapInstance.value
  }
  
  /**
   * Update viewport bounding box
   */
  function updateViewportBbox() {
    if (!state.mapInstance.value) return
    
    const bounds = state.mapInstance.value.getBounds()
    state.viewportBbox.value = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth()
    ]
  }

  /**
   * Switch basemap
   */
  function setBasemap(type: any) {
    state.basemap.value = type

    if (state.mapInstance.value) {
      const style = createStyleFromBasemap(type)
      state.mapInstance.value.setStyle(style)
    }
  }

  /**
   * Fly to a specific location
   */
  function flyTo(location: { center: [number, number]; zoom?: number }) {
    if (state.mapInstance.value) {
      state.mapInstance.value.flyTo({
        center: location.center,
        zoom: location.zoom || state.zoom.value,
        essential: true
      })
    }
  }

  // Computed properties
  const visibleLayers = computed<MapLayer[]>(() => 
    (state.layers.value || []).filter(l => l.visible)
  )

  return {
    initializeMap,
    setBasemap,
    flyTo,
    visibleLayers
  }
}
