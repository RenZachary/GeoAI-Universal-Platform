import { ref } from 'vue'
import type { MapLayer, BasemapType } from '@/types'

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
}

export function createMapState(): MapState {
  return {
    layers: ref<MapLayer[]>([]),
    basemap: ref<BasemapType>('esriStreet'),
    center: ref<[number, number]>([104.0, 35.0]),
    zoom: ref(3),
    mapInstance: ref<any>(null),
    mapContainer: ref<HTMLElement | null>(null)
  }
}
