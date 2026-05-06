<template>
  <div class="map-workspace">
    <!-- Top Toolbar -->
    <div class="map-toolbar">
      <div class="toolbar-right">
        <!-- Basemap Selector -->
        <el-dropdown @command="handleBasemapChange" trigger="click">
          <el-button class="toolbar-btn basemap-btn" size="default">
            <el-icon><MapLocation /></el-icon>
            <span class="btn-text">{{ basemapLabels[mapStore.basemap] }}</span>
            <el-icon class="arrow-icon"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu class="basemap-menu">
              <el-dropdown-item v-for="(label, key) in basemapLabels" :key="key" :command="key">
                <el-icon><component :is="getBasemapIcon(key)" /></el-icon>
                <span>{{ label }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- Layer Management Button -->
        <el-tooltip :content="t('map.layerManagement')" placement="bottom">
          <el-button 
            class="toolbar-btn layer-btn" 
            size="default"
            :type="showLayerPanel ? 'primary' : 'default'"
            @click="showLayerPanel = !showLayerPanel"
          >
            <el-icon><List /></el-icon>
            <span class="btn-text">{{ t('map.layers') }}</span>
            <el-badge :value="mapStore.visibleLayers.length" :max="99" class="layer-badge" />
          </el-button>
        </el-tooltip>
        <!-- Clear All Layers Button -->
        <el-tooltip :content="t('map.clearAllLayers')" placement="bottom">
          <el-button 
            class="toolbar-btn clear-btn" 
            size="default"
            type="danger"
            plain
            @click="handleClearAllLayers" 
            :disabled="mapStore.layers.length === 0"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </el-tooltip>

        <!-- Fullscreen Button -->
        <el-tooltip :content="isFullscreen ? t('map.exitFullscreen') : t('map.fullscreen')" placement="bottom">
          <el-button 
            class="toolbar-btn fullscreen-btn" 
            size="default"
            @click="toggleFullscreen"
          >
            <el-icon><component :is="isFullscreen ? 'Close' : 'FullScreen'" /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- Map Container -->
    <div ref="mapContainerRef" class="map-container">
      <!-- Feature Info Popup (inside map container for proper positioning) -->
      <FeatureInfoPopup 
        :visible="showFeaturePopup" 
        :features="popupFeatures" 
        :position="popupPosition"
        @close="closeFeaturePopup"
      />
    </div>

    <!-- Layer Panel Drawer -->
    <el-drawer v-model="showLayerPanel" :title="t('map.layerManagement')" direction="rtl" size="400px">
      <div class="layer-panel">
        <!-- Summary Stats -->
        <div class="layer-stats">
          <el-statistic :title="t('map.totalLayers')" :value="mapStore.layers.length" />
          <el-statistic :title="t('map.visible')" :value="mapStore.visibleLayers.length" style="margin-left: 20px" />
        </div>

        <el-empty v-if="mapStore.layers.length === 0" :description="t('map.noLayers')" :image-size="80" />

        <!-- Layers List -->
        <div v-else class="layers-list">
          <div v-for="layer in mapStore.layers" :key="layer.id" class="layer-item">
            <LayerItemCard :layer="layer" :data-source="getDataSource(layer.dataSourceId)"
              @toggle-visibility="mapStore.toggleLayerVisibility" @remove="mapStore.removeLayer"
              @opacity-change="mapStore.setLayerOpacity" />
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
import { MapLocation, List, Delete, ArrowDown } from '@element-plus/icons-vue'
import LayerItemCard from '@/components/map/LayerItemCard.vue'
import FeatureInfoPopup from '@/components/map/FeatureInfoPopup.vue'
import { ElMessage } from 'element-plus'
import { DataSource, LayerType } from '@/types'
import { getDataSourceServiceUrl } from '@/services/dataSource'

const { t } = useI18n()
const mapStore = useMapStore()
const dataSourceStore = useDataSourceStore()
const mapContainerRef = ref<HTMLElement>()
const showLayerPanel = ref(false)
const isFullscreen = ref(false)

// Feature popup state
const showFeaturePopup = ref(false)
const popupFeatures = ref<Array<{ layerId: string; layerName?: string; properties: Record<string, any> }>>([])
const popupPosition = ref({ x: 0, y: 0 })

const basemapLabels = computed(() => ({
  cartoDark: t('map.basemap.cartoDark'),
  cartoLight: t('map.basemap.cartoLight'),
  esriStreet: t('map.basemap.esriStreet'),
  esriSatellite: t('map.basemap.esriSatellite'),
  osmStandard: t('map.basemap.osmStandard'),
  stamenTerrain: t('map.basemap.stamenTerrain')
}))

// Get icon for basemap type
function getBasemapIcon(type: string) {
  const icons: Record<string, any> = {
    cartoDark: 'Moon',
    cartoLight: 'Sunny',
    esriStreet: 'Location',
    esriSatellite: 'Picture',
    osmStandard: 'MapLocation',
    stamenTerrain: 'Mountain'
  }
  return icons[type] || 'MapLocation'
}

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
        // console.log(`Layer ${layerId} already exists, skipping...`)
        continue
      }

      // Get the appropriate service URL (MVT or WMS)
      const serviceInfo = await getDataSourceServiceUrl(ds.id)

      let layerType: LayerType
      let url: string

      if (serviceInfo.serviceType === 'wms') {
        layerType = LayerType.WMS
        url = serviceInfo.serviceUrl
      } else {
        layerType = LayerType.MVT
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

  // Add click event handler to map for feature info
  if (mapStore.mapInstance) {
    mapStore.mapInstance.on('click', handleMapClick)
  }
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

// Feature popup handlers
function handleMapClick(event: any) {
  // Only query features if there are visible MVT or GeoJSON layers
  const hasQueryableLayers = mapStore.layers.some(
    layer => layer.visible && (layer.type === LayerType.MVT || layer.type === LayerType.GeoJSON)
  )

  if (!hasQueryableLayers) return

  // Get the lng/lat of the click
  const lngLat: [number, number] = [event.lngLat.lng, event.lngLat.lat]

  // Query features at this point
  const features = mapStore.queryFeaturesAtPoint(lngLat)

  if (features.length > 0) {
    // Show popup with features
    popupFeatures.value = features
    
    // Position popup relative to the map container
    const container = mapContainerRef.value
    if (container) {
      const rect = container.getBoundingClientRect()
      const x = event.originalEvent.clientX - rect.left + 10
      const y = event.originalEvent.clientY - rect.top + 10
      
      // Ensure popup stays within container bounds
      const maxX = rect.width - 320
      const maxY = rect.height - 200
      
      popupPosition.value = { 
        x: Math.min(x, maxX), 
        y: Math.min(y, maxY) 
      }
    } else {
      popupPosition.value = { x: 100, y: 100 }
    }
    
    showFeaturePopup.value = true
  } else {
    closeFeaturePopup()
  }
}

function closeFeaturePopup() {
  showFeaturePopup.value = false
  popupFeatures.value = []
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
  position: absolute;
  top: 8px;
  right: 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0px;
  border-radius: 12px;
  z-index: 1000;
  transition: all 0.3s ease;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-btn {
  height: 40px;
  padding: 0 16px;
  border-radius: 8px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;

  .btn-text {
    font-size: 14px;
  }

  .arrow-icon {
    font-size: 12px;
    margin-left: 4px;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  &.basemap-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    color: white;

    &:hover {
      background: linear-gradient(135deg, #5568d3 0%, #65408b 100%);
    }
  }

  &.layer-btn {
    position: relative;

    .layer-badge {
      position: absolute;
      top: -8px;
      right: -8px;
      
      :deep(.el-badge__content) {
        background: #f56c6c;
        border: 2px solid white;
        font-size: 11px;
        height: 18px;
        line-height: 18px;
      }
    }
  }

  &.clear-btn {
    &:hover {
      background: var(--el-color-danger-light-9);
      border-color: var(--el-color-danger);
    }
  }

  &.fullscreen-btn {
    &:hover {
      background: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary);
    }
  }
}

:deep(.el-button) {
  margin-left: 0;
}

:deep(.basemap-menu) {
  min-width: 180px;
  
  .el-dropdown-menu__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    
    .el-icon {
      font-size: 16px;
    }
  }
}

.map-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  position: relative; /* Enable absolute positioning for popup */
  overflow: visible; /* Allow popup to be visible */
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
  margin-bottom: 4px;
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
