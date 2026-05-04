# Map Basemap Configuration

**Date**: 2026-05-04  
**Purpose**: Define available basemaps using raster tile sources (no online style JSON)

---

## 1. Available Basemaps

All basemaps use **raster tile sources** compatible with MapLibre GL. No external style JSON files are required.

### 1.1 CARTO Dark (Default)
```typescript
cartoDark: {
  type: 'raster',
  tiles: ['https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
  tileSize: 256,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}
```
**Use Case**: Dark theme, ideal for data visualization with bright colors

### 1.2 CARTO Light
```typescript
cartoLight: {
  type: 'raster',
  tiles: ['https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'],
  tileSize: 256,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}
```
**Use Case**: Light theme, clean and minimal appearance

### 1.3 Esri World Street Map
```typescript
esriStreet: {
  type: 'raster',
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
}
```
**Use Case**: Detailed street map with labels, good for urban analysis

### 1.4 Esri World Imagery (Satellite)
```typescript
esriSatellite: {
  type: 'raster',
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
}
```
**Use Case**: Satellite imagery for land cover analysis and visual context

### 1.5 OpenStreetMap Standard
```typescript
osmStandard: {
  type: 'raster',
  tiles: ['https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'],
  tileSize: 256,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}
```
**Use Case**: Classic OSM style, familiar to most users

### 1.6 Stamen Terrain
```typescript
stamenTerrain: {
  type: 'raster',
  tiles: ['https://{s}.tile.stamen.com/terrain/{z}/{x}/{y}.jpg'],
  tileSize: 256,
  attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright\">ODbL</a>.'
}
```
**Use Case**: Topographic relief visualization, ideal for terrain analysis

---

## 2. Implementation

### 2.1 Type Definition (`types/map.ts`)

```typescript
export type BasemapType = 
  | 'cartoDark'
  | 'cartoLight'
  | 'esriStreet'
  | 'esriSatellite'
  | 'osmStandard'
  | 'stamenTerrain'

export interface BasemapConfig {
  type: 'raster'
  tiles: string[]
  tileSize: number
  attribution: string
}

export const BASEMAPS: Record<BasemapType, BasemapConfig> = {
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
```

### 2.2 Map Initialization (`components/map/MapView.vue`)

```typescript
function createStyleFromBasemap(basemapType: BasemapType): any {
  const basemapConfig = BASEMAPS[basemapType] || BASEMAPS.cartoDark
  
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

function initializeMap() {
  if (!mapContainer.value) return
  
  // Create minimal style with default basemap
  const defaultBasemap = mapStore.basemap || 'cartoDark'
  const style = createStyleFromBasemap(defaultBasemap)
  
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: style,
    center: [104.0, 35.0],
    zoom: 3,
    attributionControl: true
  })
  
  map.addControl(new maplibregl.NavigationControl(), 'top-right')
  map.addControl(new maplibregl.ScaleControl(), 'bottom-left')
}

function changeBasemap(basemapType: BasemapType) {
  if (!map) return
  
  const style = createStyleFromBasemap(basemapType)
  map.setStyle(style)
  
  // Re-add data layers after style change
  setTimeout(() => {
    updateLayers(mapStore.layers)
  }, 100)
}
```

### 2.3 Store Update (`stores/map.ts`)

```typescript
import type { BasemapType } from '@/types/map'

export const useMapStore = defineStore('map', () => {
  const basemap = ref<BasemapType>('cartoDark')
  
  function setBasemap(type: BasemapType) {
    basemap.value = type
  }
  
  return {
    basemap,
    setBasemap
  }
})
```

### 2.4 Basemap Selector Component (`components/map/BasemapSelector.vue`)

```vue
<template>
  <div class="basemap-selector">
    <el-select
      v-model="selectedBasemap"
      :placeholder="$t('map.selectBasemap')"
      size="small"
      @change="handleChange"
    >
      <el-option
        v-for="(config, key) in basemaps"
        :key="key"
        :label="getBasemapLabel(key)"
        :value="key"
      >
        <span class="basemap-option">
          <el-icon><component :is="getBasemapIcon(key)" /></el-icon>
          {{ getBasemapLabel(key) }}
        </span>
      </el-option>
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMapStore } from '@/stores/map'
import { BASEMAPS } from '@/types/map'
import type { BasemapType } from '@/types/map'

const mapStore = useMapStore()

const selectedBasemap = computed({
  get: () => mapStore.basemap,
  set: (value: BasemapType) => mapStore.setBasemap(value)
})

const basemaps = BASEMAPS

function getBasemapLabel(type: BasemapType): string {
  const labels: Record<BasemapType, string> = {
    cartoDark: t('map.basemap.cartoDark'),
    cartoLight: t('map.basemap.cartoLight'),
    esriStreet: t('map.basemap.esriStreet'),
    esriSatellite: t('map.basemap.esriSatellite'),
    osmStandard: t('map.basemap.osmStandard'),
    stamenTerrain: t('map.basemap.stamenTerrain')
  }
  return labels[type]
}

function getBasemapIcon(type: BasemapType) {
  const icons: Record<BasemapType, any> = {
    cartoDark: 'Moon',
    cartoLight: 'Sunny',
    esriStreet: 'Location',
    esriSatellite: 'Picture',
    osmStandard: 'MapLocation',
    stamenTerrain: 'Mountain'
  }
  return icons[type]
}

function handleChange(value: BasemapType) {
  mapStore.setBasemap(value)
}
</script>

<style scoped lang="scss">
.basemap-selector {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1000;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.basemap-option {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
```

---

## 3. Internationalization

### 3.1 English (`i18n/locales/en-US.ts`)

```typescript
export default {
  map: {
    selectBasemap: 'Select Basemap',
    basemap: {
      cartoDark: 'CARTO Dark',
      cartoLight: 'CARTO Light',
      esriStreet: 'Esri Streets',
      esriSatellite: 'Esri Satellite',
      osmStandard: 'OpenStreetMap',
      stamenTerrain: 'Stamen Terrain'
    }
  }
}
```

### 3.2 Chinese (`i18n/locales/zh-CN.ts`)

```typescript
export default {
  map: {
    selectBasemap: '选择底图',
    basemap: {
      cartoDark: 'CARTO 深色',
      cartoLight: 'CARTO 浅色',
      esriStreet: 'Esri 街道',
      esriSatellite: 'Esri 卫星',
      osmStandard: '开放街道地图',
      stamenTerrain: 'Stamen 地形'
    }
  }
}
```

---

## 4. Environment Configuration

Update `web/.env`:

```env
# Map Configuration
VITE_DEFAULT_MAP_CENTER=104.0,35.0
VITE_DEFAULT_MAP_ZOOM=3
VITE_DEFAULT_BASEMAP=cartoDark
VITE_AVAILABLE_BASEMAPS=cartoDark,cartoLight,esriStreet,esriSatellite,osmStandard,stamenTerrain
```

---

## 5. Key Benefits

1. **No External Dependencies**: All basemaps use standard raster tile URLs
2. **Offline Compatible**: Can be replaced with local tile servers
3. **Performance**: Raster tiles are cached efficiently by browsers
4. **Flexibility**: Easy to add custom basemaps by adding new entries to BASEMAPS
5. **Attribution Compliance**: All required attributions included
6. **Type Safety**: TypeScript ensures only valid basemap types are used

---

## 6. Future Enhancements

### 6.1 Local Tile Server Support
```typescript
// Add local basemap option
localTiles: {
  type: 'raster',
  tiles: [`http://localhost:8080/tiles/{z}/{x}/{y}.png`],
  tileSize: 256,
  attribution: 'Local Tile Server'
}
```

### 6.2 Custom Basemap Upload
Allow users to upload GeoTIFF files as custom basemaps:
```typescript
async function addCustomBasemap(file: File) {
  // Convert GeoTIFF to tiles using gdal2tiles
  // Add to BASEMAPS dynamically
}
```

### 6.3 Basemap Opacity Control
```vue
<el-slider
  v-model="basemapOpacity"
  :min="0"
  :max="1"
  :step="0.1"
  @input="updateBasemapOpacity"
/>
```

---

**Document Created**: 2026-05-04  
**Status**: Ready for Implementation
