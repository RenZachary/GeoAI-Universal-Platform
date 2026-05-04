<template>
  <div class="layer-item-card" :class="{ 'is-visible': layer.visible }">
    <!-- Header with checkbox and actions -->
    <div class="card-header">
      <el-checkbox 
        :model-value="layer.visible"
        @change="(val) => $emit('toggle-visibility', layer.id)"
        class="layer-checkbox"
      >
        <span class="layer-name">{{ dataSource?.name || layer.id }}</span>
      </el-checkbox>
      
      <div class="card-actions">
        <el-button 
          text 
          size="small"
          @click="handleShowInfo"
          title="Show Info"
        >
          <el-icon><InfoFilled /></el-icon>
        </el-button>
        <el-button 
          text 
          type="danger"
          size="small"
          @click="$emit('remove', layer.id)"
          title="Remove Layer"
        >
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>
    </div>
    
    <!-- Metadata -->
    <div class="card-metadata">
      <div class="meta-row">
        <el-tag size="small" :type="getTypeColor(dataSource?.type)">
          {{ getDisplayType(dataSource?.type) }}
        </el-tag>
        <span v-if="dataSource" class="record-count">
          {{ (dataSource.metadata as any)?.featureCount || 'N/A' }} features
        </span>
      </div>
      
      <div v-if="dataSource" class="source-info">
        <el-icon><Folder /></el-icon>
        <span>{{ dataSource.type === 'postgis' ? 'PostGIS Database' : 'Local File' }}</span>
      </div>
    </div>
    
    <!-- Opacity Control -->
    <div v-if="layer.visible" class="opacity-control">
      <span class="opacity-label">Opacity: {{ Math.round((layer.opacity || 1) * 100) }}%</span>
      <el-slider 
        :model-value="layer.opacity || 1"
        :min="0"
        :max="1"
        :step="0.05"
        @input="(val: number) => $emit('opacity-change', layer.id, val)"
        size="small"
      />
    </div>
    
    <!-- Info Dialog -->
    <el-dialog
      v-model="showInfoDialog"
      :title="dataSource?.name || 'Layer Information'"
      width="500px"
    >
      <el-descriptions :column="1" border>
        <el-descriptions-item label="Layer ID">
          {{ layer.id }}
        </el-descriptions-item>
        <el-descriptions-item label="Type">
          <el-tag size="small">{{ getDisplayType(dataSource?.type) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Source" v-if="dataSource">
          {{ dataSource.type === 'postgis' ? 'PostGIS Database' : 'Local File' }}
        </el-descriptions-item>
        <el-descriptions-item label="Features" v-if="dataSource">
          {{ (dataSource.metadata as any)?.featureCount || 'N/A' }}
        </el-descriptions-item>
        <el-descriptions-item label="Created">
          {{ formatDate(layer.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="URL" v-if="layer.url">
          <el-text truncated>{{ layer.url }}</el-text>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Delete, InfoFilled, Folder } from '@element-plus/icons-vue'
import type { MapLayer, DataSource } from '@/types'

const props = defineProps<{
  layer: MapLayer
  dataSource?: DataSource
}>()

const emit = defineEmits<{
  toggleVisibility: [layerId: string]
  remove: [layerId: string]
  opacityChange: [layerId: string, opacity: number]
}>()

const showInfoDialog = ref(false)

function handleShowInfo() {
  showInfoDialog.value = true
}

function getTypeColor(type?: string): string {
  const colors: Record<string, string> = {
    postgis: 'success',
    geojson: 'primary',
    shapefile: 'warning',
    csv: 'info',
    geotiff: 'danger'
  }
  return colors[type || ''] || ''
}

function getDisplayType(type?: string): string {
  const types: Record<string, string> = {
    postgis: 'PostGIS',
    geojson: 'GeoJSON',
    shapefile: 'Shapefile',
    csv: 'CSV',
    geotiff: 'GeoTIFF'
  }
  return types[type || ''] || type || 'Unknown'
}

function formatDate(dateString: string): string {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped lang="scss">
.layer-item-card {
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  margin-bottom: 12px;
  background: #fff;
  transition: all 0.3s;
  
  &.is-visible {
    border-color: #409eff;
    box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
  }
  
  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  
  .layer-checkbox {
    flex: 1;
    
    :deep(.el-checkbox__label) {
      font-weight: 500;
      color: #303133;
    }
  }
  
  .layer-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
    display: inline-block;
  }
  
  .card-actions {
    display: flex;
    gap: 4px;
  }
}

.card-metadata {
  margin-bottom: 8px;
  
  .meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    
    .record-count {
      font-size: 12px;
      color: #909399;
    }
  }
  
  .source-info {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #606266;
    
    .el-icon {
      font-size: 14px;
    }
  }
}

.opacity-control {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
  
  .opacity-label {
    display: block;
    font-size: 12px;
    color: #606266;
    margin-bottom: 4px;
  }
  
  :deep(.el-slider) {
    margin: 0;
  }
}
</style>
