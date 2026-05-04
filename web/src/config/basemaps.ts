import type { BasemapConfig } from '@/types'

/**
 * Available basemaps configuration
 * All use raster tile sources for offline compatibility
 */
export const BASEMAPS: Record<string, BasemapConfig> = {
  cartoDark: {
    type: 'raster',
    tiles: ['https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  
  cartoLight: {
    type: 'raster',
    tiles: ['https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'],
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  
  esriStreet: {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
  },
  
  esriSatellite: {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  },
  
  osmStandard: {
    type: 'raster',
    tiles: ['https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  
  stamenTerrain: {
    type: 'raster',
    tiles: ['https://{s}.tile.stamen.com/terrain/{z}/{x}/{y}.jpg'],
    tileSize: 256,
    attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>.'
  }
}

/**
 * Generate MapLibre style object from basemap type
 */
export function createStyleFromBasemap(basemapType: string): any {
  const basemapConfig = BASEMAPS[basemapType] || BASEMAPS.esriStreet
  
  return {
    version: 8,
    sources: {
      basemap: basemapConfig
    },
    layers: [
      {
        id: 'basemap-layer',
        type: 'raster',
        source: 'basemap',
        minzoom: 0,
        maxzoom: 22
      }
    ]
  }
}

/**
 * Get list of available basemap types
 */
export function getAvailableBasemaps(): string[] {
  return Object.keys(BASEMAPS)
}
