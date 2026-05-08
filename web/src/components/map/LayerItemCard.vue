<template>
  <div class="layer-item-card" :class="{ 'is-visible': layer.visible }">
    <!-- Header with checkbox and actions -->
    <div class="card-header">
      <el-checkbox 
        :model-value="layer.visible"
        @change="() => $emit('toggleVisibility', layer.id)"
        class="layer-checkbox"
      >
        <span class="layer-name">{{ layer.name || dataSource?.name || layer.id }}</span>
      </el-checkbox>
      
      <div class="card-actions">
        <el-button 
          text 
          size="small"
          @click="handleShowInfo"
          :title="t('map.showInfo')"
        >
          <el-icon><InfoFilled /></el-icon>
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
          {{ featuresLabel }}
        </span>
      </div>
      
      <div v-if="dataSource" class="source-info">
        <el-icon><Folder /></el-icon>
        <span>{{ sourceLabel }}</span>
      </div>
    </div>
    
    <!-- Opacity Control -->
    <div v-if="layer.visible" class="opacity-control">
      <span class="opacity-label">{{ t('map.opacity') }}: {{ Math.round((layer.opacity || 1) * 100) }}%</span>
      <el-slider 
        :model-value="layer.opacity || 1"
        :min="0"
        :max="1"
        :step="0.05"
        @input="(val: number) => $emit('opacityChange', layer.id, val)"
        size="small"
      />
    </div>
    
    <!-- Info Dialog -->
    <el-dialog
      v-model="showInfoDialog"
      :title="dataSource?.name || t('map.layerInformation')"
    >
      <el-descriptions :column="1" border>
        <el-descriptions-item :label="t('map.layerId')">
          {{ layer.id }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('map.type')">
          <el-tag size="small">{{ getDisplayType(dataSource?.type) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('map.source')" v-if="dataSource">
          {{ sourceLabel }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('data.features')" v-if="dataSource">
          {{ featuresLabel }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('map.created')">
          {{ formatDate(layer.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('map.url')" v-if="layer.url">
          <el-text truncated>{{ layer.url }}</el-text>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { InfoFilled, Folder } from '@element-plus/icons-vue'
import type { MapLayer, DataSource } from '@/types'

const { t } = useI18n()

const props = defineProps<{
  layer: MapLayer
  dataSource?: DataSource
}>()

const emit = defineEmits<{
  toggleVisibility: [layerId: string]
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
  return colors[type || ''] || 'info'
}

function getDisplayType(type?: string): string {
  const types: Record<string, string> = {
    postgis: t('map.dataSourceTypes.postgis'),
    geojson: t('map.dataSourceTypes.geojson'),
    shapefile: t('map.dataSourceTypes.shapefile'),
    csv: t('map.dataSourceTypes.csv'),
    tif: t('map.dataSourceTypes.geotiff')
  }
  return types[type || ''] || t('map.dataSourceTypes.unknown')
}

function formatDate(dateString: string): string {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Computed properties for translated labels
const sourceLabel = computed(() => {
  return props.dataSource?.type === 'postgis' ? t('map.postgisDatabase') : t('map.localFile')
})

const featuresLabel = computed(() => {
  const count = (props.dataSource?.metadata as any)?.featureCount
  return count !== undefined && count !== null ? `${count} ${t('map.features')}` : 'N/A'
})
</script>

<style scoped lang="scss">
.layer-item-card {
  padding: 0px 4px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
  transition: all 0.3s;
  
  &.is-visible {
    border-color: var(--el-color-primary);
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
  margin-bottom: 2px;
  
  .layer-checkbox {
    flex: 1;
    
    :deep(.el-checkbox__label) {
      font-weight: 500;
      color: var(--el-text-color-primary);
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
  margin-bottom: 0px;
  display: flex;
  gap: 8px;
  
  .meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    
    .record-count {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
  
  .source-info {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--el-text-color-regular);
    margin-bottom: 6px;
    
    .el-icon {
      font-size: 14px;
    }
  }
}

.opacity-control {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-light);
  
  .opacity-label {
    display: block;
    font-size: 12px;
    color: var(--el-text-color-regular);
    margin-bottom: 4px;
  }
  
  :deep(.el-slider) {
    margin: 0;
  }
}
</style>
