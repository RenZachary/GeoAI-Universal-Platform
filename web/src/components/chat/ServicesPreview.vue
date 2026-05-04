<template>
  <transition name="services-slide">
    <div v-if="services.length > 0" class="services-preview">
      <div class="preview-header">
        <h4 class="preview-title">
          <el-icon class="mr-1"><Files /></el-icon>
          Generated Services ({{ services.length }})
        </h4>
        <el-text size="small" type="info">
          Results appear as they become available
        </el-text>
      </div>

      <div class="services-grid">
        <ServicePreviewCard
          v-for="service in services"
          :key="service.id"
          :service="service"
          @preview="handlePreview"
          @download="handleDownload"
          @click="handleServiceClick"
          @view-on-map="handleViewOnMap"
        />
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { Files } from '@element-plus/icons-vue'
import ServicePreviewCard from './ServicePreviewCard.vue'
import { watch } from 'vue'

interface Props {
  services: Array<{
    id: string
    type: string
    url: string
    ttl?: number
    expiresAt?: string
    metadata?: any
    goalId?: string
    stepId?: string
  }>
}

const props = defineProps<Props>()

// Debug: Watch services changes
watch(() => props.services, (newVal) => {
  console.log('[ServicesPreview] Services changed:', newVal.length, 'items')
  console.log('[ServicesPreview] Services data:', JSON.stringify(newVal, null, 2))
}, { deep: true, immediate: true })

const emit = defineEmits<{
  preview: [service: Props['services'][number]]
  download: [service: Props['services'][number]]
  click: [service: Props['services'][number]]
  'view-on-map': [service: Props['services'][number]]
}>()

function handlePreview(service: Props['services'][number]) {
  emit('preview', service)
}

function handleDownload(service: Props['services'][number]) {
  emit('download', service)
}

function handleServiceClick(service: Props['services'][number]) {
  emit('click', service)
}

function handleViewOnMap(service: Props['services'][number]) {
  emit('view-on-map', service)
}
</script>

<style scoped lang="scss">
.services-preview {
  padding: 16px 24px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.preview-title {
  display: flex;
  align-items: center;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.mr-1 {
  margin-right: 8px;
}

.services-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

/* Transition animations */
.services-slide-enter-active,
.services-slide-leave-active {
  transition: all 0.3s ease;
}

.services-slide-enter-from,
.services-slide-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
