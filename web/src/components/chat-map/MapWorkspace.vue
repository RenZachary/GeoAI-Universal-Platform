<template>
  <div class="map-workspace">
    <!-- Top Toolbar -->
    <div class="map-toolbar">
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
      
      <div class="toolbar-spacer"></div>
      
      <!-- Clear All Layers Button -->
      <el-button 
        type="danger" 
        size="small"
        @click="handleClearAllLayers"
        :disabled="mapStore.layers.length === 0"
      >
        <el-icon><Delete /></el-icon>
        {{ t('map.clearAllLayers') }}
      </el-button>
      
      <!-- Fullscreen Button -->
      <el-button 
        type="primary" 
        size="small"
        @click="toggleFullscreen"
      >
        <el-icon><FullScreen /></el-icon>
        {{ isFullscreen ? t('map.exitFullscreen') : t('map.fullscreen') }}
      </el-button>
    </div>

    <!-- Map Container -->
    <div ref="mapContainerRef" class="map-container"></div>
    
    <!-- Layer Panel Drawer -->
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
        
        <!-- Layers List -->
        <div v-else class="layers-list">
          <div 
            v-for="layer in mapStore.layers" 
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
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapStore } from '@/stores/map'
import { useDataSourceStore } from '@/stores/dataSources'
import { MapLocation, List, Delete, FullScreen } from '@element-plus/icons-vue'
import LayerItemCard from '@/components/map/LayerItemCard.vue'
import { ElMessage } from 'element-plus'
import type { DataSource } from '@/types'
import { getDataSourceServiceUrl } from '@/services/dataSource'

const { t } = useI18n()
const mapStore = useMapStore()
const dataSourceStore = useDataSourceStore()
const mapContainerRef = ref<HTMLElement>()
const showLayerPanel = ref(false)
const isFullscreen = ref(false)

const basemapLabels = computed(() => ({
  cartoDark: t('map.basemap.cartoDark'),
  cartoLight: t('map.basemap.cartoLight'),
  esriStreet: t('map.basemap.esriStreet'),
  esriSatellite: t('map.basemap.esriSatellite'),
  osmStandard: t('map.basemap.osmStandard'),
  stamenTerrain: t('map.basemap.stamenTerrain')
}))

onMounted(async () => {
  // Load data sources
  await dataSourceStore.loadDataSources()
  
  // Always initialize map with basemap
  if (mapContainerRef.value) {
    // Generate a unique ID for the container
    const containerId = 'map-workspace-' + Date.now()
    mapContainerRef.value.id = containerId
    mapStore.initializeMap(containerId)
  }
  
  // Auto-add all data sources as map layers
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
      
      let layerType: 'geojson' | 'mvt' | 'wms' | 'heatmap' | 'image'
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
        visible: false, // Default to invisible (user must toggle)
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
  
  // Listen for fullscreen changes
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

// Helper function to get data source by layer's dataSourceId
function getDataSource(dataSourceId?: string): DataSource | undefined {
  if (!dataSourceId) return undefined
  return dataSourceStore.dataSources.find(ds => ds.id === dataSourceId)
}

function handleBasemapChange(basemapType: string) {
  mapStore.setBasemap(basemapType as any)
}

function handleClearAllLayers() {
  mapStore.clearAllLayers()
  ElMessage.success(t('map.allLayersCleared'))
}

function toggleFullscreen() {
  const container = mapContainerRef.value
  
  if (!container) return
  
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      console.error('[MapWorkspace] Fullscreen error:', err)
      ElMessage.error('Failed to enter fullscreen mode')
    })
  } else {
    document.exitFullscreen()
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}
</script>

<style scoped lang="scss">
.map-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.map-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  z-index: 1000;
}

.toolbar-spacer {
  flex: 1;
}

.map-container {
  flex: 1;
  width: 100%;
  min-height: 0;
}

#map-workspace-container {
  width: 100%;
  height: 100%;
}

.layer-panel {
  padding: 8px;
}

:deep(.el-drawer__header) {
  margin-bottom: 0;
}

:deep(.el-drawer__body) {
  padding: 10px;
}

.layer-item {
  border-radius: 8px;
  margin-bottom: 12px;
  background: var(--el-fill-color-lighter);
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
  max-height: calc(100vh - 200px);
}
</style>
