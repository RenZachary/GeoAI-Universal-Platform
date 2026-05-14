import { ref } from 'vue'
import type { MapLayer, BasemapType } from '@/types'

/**
 * Spatial Context Types
 */
export interface SelectedFeature {
  datasetId: string
  featureId: string
  geometry: GeoJSON.Geometry
  properties: Record<string, any>
}

export interface DrawnGeometry {
  id: string
  type: 'polygon' | 'circle' | 'line' | 'rectangle'
  geometry: GeoJSON.Geometry
  properties?: Record<string, any>
  createdAt: Date
}

/**
 * Map Store State
 * Centralized state management for map-related data
 */
export interface MapState {
  layers: ReturnType<typeof ref<MapLayer[]>>
  basemap: ReturnType<typeof ref<BasemapType>>
  center: ReturnType<typeof ref<[number, number]>>
  zoom: ReturnType<typeof ref<number>>
  mapInstance: ReturnType<typeof ref<any>>
  mapContainer: ReturnType<typeof ref<HTMLElement | null>>
  
  // Spatial context tracking
  viewportBbox: ReturnType<typeof ref<[number, number, number, number] | null>>
  selectedFeature: ReturnType<typeof ref<SelectedFeature | null>>
  drawnGeometries: ReturnType<typeof ref<DrawnGeometry[]>>
}

export function createMapState(): MapState {
  return {
    layers: ref<MapLayer[]>([]),
    basemap: ref<BasemapType>('esriStreet'),
    center: ref<[number, number]>([104.0, 35.0]),
    zoom: ref(3),
    mapInstance: ref<any>(null),
    mapContainer: ref<HTMLElement | null>(null),
    
    // Spatial context tracking
    viewportBbox: ref<[number, number, number, number] | null>(null),
    selectedFeature: ref<SelectedFeature | null>(null),
    drawnGeometries: ref<DrawnGeometry[]>([])
  }
}
