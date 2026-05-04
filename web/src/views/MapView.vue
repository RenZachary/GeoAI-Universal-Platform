<template>
  <div class="map-view">
    <!-- Map Container -->
    <div id="map-container" ref="mapContainerRef" class="map-container"></div>
    
    <!-- Map Controls Overlay -->
    <div class="map-controls">
      <!-- Basemap Selector -->
      <el-dropdown @command="handleBasemapChange">
        <el-button type="primary" size="small">
          <el-icon><MapLocation /></el-icon>
          {{ basemapLabels[mapStore.basemap] }}
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item 
              v-for="(label, key) in basemapLabels" 
              :key="key"
              :command="key"
            >
              {{ label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      
      <!-- Layer Management Button -->
      <el-button 
        type="primary" 
        size="small"
        @click="showLayerPanel = !showLayerPanel"
      >
        <el-icon><List /></el-icon>
        {{ t('map.layers') }} ({{ mapStore.visibleLayers.length }})
      </el-button>
    </div>
    
    <!-- Layer Panel -->
    <el-drawer
      v-model="showLayerPanel"
      :title="t('map.layerManagement')"
      direction="rtl"
      size="400px"
    >
      <div class="layer-panel">
        <!-- Summary Stats -->
        <div class="layer-stats">
          <el-statistic :title="t('map.totalLayers')" :value="mapStore.layers.length" />
          <el-statistic :title="t('map.visible')" :value="mapStore.visibleLayers.length" style="margin-left: 20px" />
        </div>
        
        <el-empty 
          v-if="mapStore.layers.length === 0"
          :description="t('map.noLayers')"
          :image-size="80"
        />
        
        <!-- Layers Grouped by Type -->
        <div v-else class="layers-list">
          <!-- PostGIS Layers -->
          <div v-if="postgisLayers.length > 0" class="layer-group">
            <div class="group-header">
              <el-icon><Connection /></el-icon>
              <span>{{ t('map.postgisGroup') }} ({{ postgisLayers.length }})</span>
            </div>
            <div 
              v-for="layer in postgisLayers" 
              :key="layer.id"
              class="layer-item"
            >
              <LayerItemCard 
                :layer="layer" 
                :data-source="getDataSource(layer.dataSourceId)"
                @toggle-visibility="mapStore.toggleLayerVisibility"
                @remove="mapStore.removeLayer"
                @opacity-change="mapStore.setLayerOpacity"
              />
            </div>
          </div>
          
          <!-- GeoJSON Layers -->
          <div v-if="geojsonLayers.length > 0" class="layer-group">
            <div class="group-header">
              <el-icon><Document /></el-icon>
              <span>{{ t('map.localFilesGroup') }} ({{ geojsonLayers.length }})</span>
            </div>
            <div 
              v-for="layer in geojsonLayers" 
              :key="layer.id"
              class="layer-item"
            >
              <LayerItemCard 
                :layer="layer" 
                :data-source="getDataSource(layer.dataSourceId)"
                @toggle-visibility="mapStore.toggleLayerVisibility"
                @remove="mapStore.removeLayer"
                @opacity-change="mapStore.setLayerOpacity"
              />
            </div>
          </div>
          
          <!-- WMS/Raster Layers -->
          <div v-if="wmsLayers.length > 0" class="layer-group">
            <div class="group-header">
              <el-icon><Picture /></el-icon>
              <span>{{ t('map.rasterWmsGroup') }} ({{ wmsLayers.length }})</span>
            </div>
            <div 
              v-for="layer in wmsLayers" 
              :key="layer.id"
              class="layer-item"
            >
              <LayerItemCard 
                :layer="layer" 
                :data-source="getDataSource(layer.dataSourceId)"
                @toggle-visibility="mapStore.toggleLayerVisibility"
                @remove="mapStore.removeLayer"
                @opacity-change="mapStore.setLayerOpacity"
              />
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '@/stores/map'
import { useDataSourceStore } from '@/stores/dataSources'
import { MapLocation, List, Connection, Document, Picture } from '@element-plus/icons-vue'
import type { DataSource } from '@/types'
import LayerItemCard from '@/components/map/LayerItemCard.vue'
import { getDataSourceServiceUrl } from '@/services/dataSource'

const { t } = useI18n()
const mapStore = useMapStore()
const dataSourceStore = useDataSourceStore()
const mapContainerRef = ref<HTMLElement>()
const showLayerPanel = ref(false)

const basemapLabels = computed(() => ({
  cartoDark: t('map.basemap.cartoDark'),
  cartoLight: t('map.basemap.cartoLight'),
  esriStreet: t('map.basemap.esriStreet'),
  esriSatellite: t('map.basemap.esriSatellite'),
  osmStandard: t('map.basemap.osmStandard'),
  stamenTerrain: t('map.basemap.stamenTerrain')
}))

// Computed properties for layer grouping
const postgisLayers = computed(() => 
  mapStore.layers.filter(l => {
    const ds = getDataSource(l.dataSourceId)
    return ds?.type === 'postgis'
  })
)

const geojsonLayers = computed(() => 
  mapStore.layers.filter(l => {
    const ds = getDataSource(l.dataSourceId)
    return ds && ['geojson', 'shapefile', 'csv'].includes(ds.type)
  })
)

const wmsLayers = computed(() => 
  mapStore.layers.filter(l => {
    const ds = getDataSource(l.dataSourceId)
    return ds?.type === 'geotiff' || l.type === 'wms'
  })
)

// Helper function to get data source by ID
function getDataSource(dataSourceId?: string): DataSource | undefined {
  if (!dataSourceId) return undefined
  return dataSourceStore.dataSources.find(ds => ds.id === dataSourceId)
}

onMounted(async () => {
  // Initialize map
  if (mapContainerRef.value) {
    mapStore.initializeMap('map-container')
  }
  
  // Load data sources and auto-add as layers
  await dataSourceStore.loadDataSources()
  
  // Auto-add all data sources as map layers with proper service URLs
  for (const ds of dataSourceStore.dataSources) {
    try {
      const layerId = `layer-${ds.id}`
      
      // Check if layer already exists to prevent duplicates
      const existingLayer = mapStore.layers.find(l => l.id === layerId)
      if (existingLayer) {
        console.log(`Layer ${layerId} already exists, skipping...`)
        continue
      }
      
      // Get the appropriate service URL (MVT or WMS)
      const serviceInfo = await getDataSourceServiceUrl(ds.id)
      
      let layerType: 'geojson' | 'mvt' | 'wms' | 'heatmap'
      let url: string
      
      if (serviceInfo.serviceType === 'wms') {
        layerType = 'wms'
        url = serviceInfo.serviceUrl
      } else {
        layerType = 'mvt'
        url = serviceInfo.serviceUrl
      }
      
      mapStore.addLayer({
        id: layerId,
        type: layerType,
        url: url,
        visible: true,
        opacity: 0.7,
        dataSourceId: ds.id,  // Link to data source
        style: {
          fillColor: '#409eff',
          fillOpacity: 0.5
        },
        sourceLayer: ds.type === 'postgis' ? 'default' : undefined
      })
    } catch (error) {
      console.error(`Failed to add layer for data source ${ds.id}:`, error)
    }
  }
})

function handleBasemapChange(basemapType: string) {
  mapStore.setBasemap(basemapType as any)
}

// Cleanup on component unmount
onUnmounted(() => {
  // Remove all auto-added layers from data sources
  dataSourceStore.dataSources.forEach(ds => {
    const layerId = `layer-${ds.id}`
    mapStore.removeLayer(layerId)
  })
})

</script>

<style scoped lang="scss">
.map-view {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  width: 100%;
  height: 100%;
}

.map-controls {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 1000;
  display: flex;
  gap: 8px;
}

.layer-panel {
  padding: 8px;
}

:deep(.el-drawer__header){
  margin-bottom: 0;
}
:deep(.el-drawer__body){
  padding:10px;
}

.layer-item {
  border-radius: 8px;
  margin-bottom: 12px;
  background: var(--el-fill-color-lighter);
}

.layer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.layer-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.layer-url {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-opacity {
  margin-top: 8px;
}

.opacity-label {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-bottom: 4px;
  display: block;
}

.layer-stats {
  display: flex;
  gap: 20px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  margin-bottom: 12px;
}

.layers-list {
  overflow-y: auto;
}

.layer-group {
  margin-bottom: 20px;
  
  .group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--el-fill-color-light);
    border-radius: 4px;
    margin-bottom: 12px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    font-size: 14px;
    
    .el-icon {
      font-size: 16px;
      color: var(--el-color-primary);
    }
  }
}
</style>
