<template>
  <div class="service-card" @click="handleClick">
    <!-- Service Header -->
    <div class="service-header">
      <el-icon class="service-icon" :class="iconClass">
        <component :is="serviceIcon" />
      </el-icon>
      <div class="service-info">
        <h4 class="service-title">{{ serviceTitle }}</h4>
        <span class="service-type">{{ service.type.toUpperCase() }}</span>
      </div>
      <el-tag size="small" :type="statusType" effect="plain">
        {{ statusText }}
      </el-tag>
    </div>

    <!-- Service Details -->
    <div class="service-details">
      <div class="detail-row">
        <span class="detail-label">URL:</span>
        <el-text class="detail-value" type="info" truncated>
          {{ service.url }}
        </el-text>
      </div>
      
      <div v-if="service.ttl" class="detail-row">
        <span class="detail-label">TTL:</span>
        <span class="detail-value">{{ formatTTL(service.ttl) }}</span>
      </div>
      
      <div v-if="expiresAt" class="detail-row">
        <span class="detail-label">Expires:</span>
        <span class="detail-value">{{ expiresAt }}</span>
      </div>
    </div>

    <!-- Service Actions -->
    <div class="service-actions">
      <!-- Only show Preview/Download for file-based services (geojson, report, etc.) -->
      <template v-if="isFileBasedService">
        <el-button 
          size="small" 
          text 
          type="primary"
          @click.stop="handlePreview"
        >
          <el-icon><View /></el-icon>
          Preview
        </el-button>
        <el-button 
          size="small" 
          text 
          type="success"
          @click.stop="handleDownload"
        >
          <el-icon><Download /></el-icon>
          Download
        </el-button>
      </template>
      
      <!-- For MVT/WMS services, show "View on Map" button -->
      <template v-else>
        <el-button 
          size="small" 
          type="primary"
          @click.stop="handleViewOnMap"
        >
          <el-icon><MapLocation /></el-icon>
          View on Map
        </el-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { View, Download, Document, MapLocation, DataAnalysis } from '@element-plus/icons-vue'

interface Props {
  service: {
    id: string
    type: string
    url: string
    ttl?: number
    expiresAt?: string
    metadata?: any
    goalId?: string
    stepId?: string
  }
}

const props = defineProps<Props>()

// Debug: Log when card is rendered
console.log('[ServicePreviewCard] Rendering card for service:', props.service.id, 'type:', props.service.type)

const emit = defineEmits<{
  preview: [service: Props['service']]
  download: [service: Props['service']]
  click: [service: Props['service']]
  'view-on-map': [service: Props['service']]
}>()

// Computed properties
const serviceIcon = computed(() => {
  const iconMap: Record<string, any> = {
    geojson: Document,
    mvt: MapLocation,
    wms: MapLocation,
    report: DataAnalysis,
    default: Document
  }
  return iconMap[props.service.type] || iconMap.default
})

const iconClass = computed(() => {
  return `icon-${props.service.type}`
})

const serviceTitle = computed(() => {
  const metadata = props.service.metadata
  if (metadata?.pluginId) {
    return metadata.pluginId.replace(/_/g, ' ')
  }
  return props.service.stepId || 'Service'
})

const statusType = computed(() => {
  return 'success' // Services are ready when they appear
})

const statusText = computed(() => {
  return 'Ready'
})

const expiresAt = computed(() => {
  if (!props.service.expiresAt) return null
  
  try {
    const date = new Date(props.service.expiresAt)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return null
  }
})

// Check if service is file-based (can be downloaded)
const isFileBasedService = computed(() => {
  // File-based services that can be previewed/downloaded
  const fileTypes = ['geojson', 'report', 'image']
  return fileTypes.includes(props.service.type.toLowerCase())
})

// Methods
function handleClick() {
  emit('click', props.service)
}

function handlePreview() {
  emit('preview', props.service)
}

function handleDownload() {
  emit('download', props.service)
}

function handleViewOnMap() {
  // Emit event to add layer to map
  emit('view-on-map', props.service)
}

function formatTTL(ttlMs: number): string {
  const minutes = Math.floor(ttlMs / 60000)
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours} hr`
}
</script>

<style scoped lang="scss">
.service-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: var(--el-color-primary-light-5);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
  }
}

.service-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.service-icon {
  font-size: 24px;
  padding: 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  
  &.icon-geojson {
    color: var(--el-color-success);
  }
  
  &.icon-mvt, &.icon-wms {
    color: var(--el-color-primary);
  }
  
  &.icon-report {
    color: var(--el-color-warning);
  }
}

.service-info {
  flex: 1;
  min-width: 0;
}

.service-title {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-type {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.service-details {
  margin-bottom: 12px;
}

.detail-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.detail-label {
  color: var(--el-text-color-secondary);
  font-weight: 500;
  min-width: 60px;
  flex-shrink: 0;
}

.detail-value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
