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
        Layers ({{ mapStore.visibleLayers.length }})
      </el-button>
    </div>
    
    <!-- Layer Panel -->
    <el-drawer
      v-model="showLayerPanel"
      title="Layer Management"
      direction="rtl"
      size="400px"
    >
      <div class="layer-panel">
        <!-- Summary Stats -->
        <div class="layer-stats">
          <el-statistic title="Total Layers" :value="mapStore.layers.length" />
          <el-statistic title="Visible" :value="mapStore.visibleLayers.length" style="margin-left: 20px" />
        </div>
        
        <el-button 
          type="danger" 
          size="small" 
          @click="handleClearAllLayers"
          style="margin: 16px 0"
        >
          Clear All Layers
        </el-button>
        
        <el-empty 
          v-if="mapStore.layers.length === 0"
          description="No layers added. Data sources will appear here automatically."
          :image-size="80"
        />
        
        <!-- Layers Grouped by Type -->
        <div v-else class="layers-list">
          <!-- PostGIS Layers -->
          <div v-if="postgisLayers.length > 0" class="layer-group">
            <div class="group-header">
              <el-icon><Connection /></el-icon>
              <span>PostGIS ({{ postgisLayers.length }})</span>
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
              <span>Local Files ({{ geojsonLayers.length }})</span>
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
              <span>Raster/WMS ({{ wmsLayers.length }})</span>
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
import { onMounted, ref, computed } from 'vue'
import { useMapStore } from '@/stores/map'
import { useDataSourceStore } from '@/stores/dataSources'
import { MapLocation, List, Delete, Connection, Document, Picture } from '@element-plus/icons-vue'
import type { DataSource } from '@/types'
import LayerItemCard from '@/components/map/LayerItemCard.vue'

const mapStore = useMapStore()
const dataSourceStore = useDataSourceStore()
const mapContainerRef = ref<HTMLElement>()
const showLayerPanel = ref(false)

const basemapLabels: Record<string, string> = {
  cartoDark: 'CARTO Dark',
  cartoLight: 'CARTO Light',
  esriStreet: 'Esri Streets',
  esriSatellite: 'Esri Satellite',
  osmStandard: 'OpenStreetMap',
  stamenTerrain: 'Stamen Terrain'
}

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
  
  // Auto-add all data sources as map layers
  dataSourceStore.dataSources.forEach(ds => {
    let layerType: 'geojson' | 'mvt' | 'wms' | 'heatmap' = 'geojson'
    let url = ''
    
    // Determine layer type based on data source type
    if (ds.type === 'postgis') {
      layerType = 'mvt'
      url = `/api/mvt-dynamic/${ds.id}/{z}/{x}/{y}.pbf`
    } else if (ds.type === 'geotiff') {
      layerType = 'wms'
      url = `/api/wms/${ds.id}`
    } else {
      // geojson, shapefile, csv
      layerType = 'geojson'
      url = `/api/datasources/${ds.id}/geojson`
    }
    
    mapStore.addLayer({
      id: `layer-${ds.id}`,
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
  })
})

function handleBasemapChange(basemapType: string) {
  mapStore.setBasemap(basemapType as any)
}

function handleClearAllLayers() {
  mapStore.clearAllLayers()
}

function truncateUrl(url: string, maxLength: number = 40): string {
  if (url.length <= maxLength) return url
  return url.substring(0, maxLength) + '...'
}
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

.layer-item {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: #f9fafb;
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
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-opacity {
  margin-top: 8px;
}

.opacity-label {
  font-size: 12px;
  color: #606266;
  margin-bottom: 4px;
  display: block;
}

.layer-stats {
  display: flex;
  gap: 20px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 12px;
}

.layers-list {
  max-height: calc(100vh - 250px);
  overflow-y: auto;
}

.layer-group {
  margin-bottom: 20px;
  
  .group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #f0f2f5;
    border-radius: 4px;
    margin-bottom: 12px;
    font-weight: 600;
    color: #303133;
    font-size: 14px;
    
    .el-icon {
      font-size: 16px;
      color: #409eff;
    }
  }
}
</style>
