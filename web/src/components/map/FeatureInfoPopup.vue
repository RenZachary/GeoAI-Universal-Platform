<template>
  <div v-if="visible" class="feature-info-popup" :style="popupStyle">
    <div class="popup-header">
      <span class="popup-title">{{ t('map.featureInfo') }}</span>
      <el-button text size="small" @click="close">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>
    
    <div class="popup-content">
      <div v-if="!features || features.length === 0" class="no-feature">
        {{ t('map.noFeatureFound') }}
      </div>
      
      <div v-else class="features-list">
        <div v-for="(feature, index) in features" :key="index" class="feature-item">
          <div v-if="features.length > 1" class="feature-header">
            <el-tag size="small" type="primary">
              {{ t('map.features') }} {{ index + 1 }}/{{ features.length }}
            </el-tag>
            <span v-if="feature.layerName" class="layer-name">{{ feature.layerName }}</span>
          </div>
          
          <div class="properties-section">
            <div class="section-title">{{ t('map.properties') }}</div>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item 
                v-for="(value, key) in feature.properties" 
                :key="key" 
                :label="String(key)"
              >
                <span class="property-value">{{ formatValue(value) }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Close } from '@element-plus/icons-vue'

const { t } = useI18n()

interface FeatureProperty {
  layerName?: string
  properties: Record<string, any>
}

const props = defineProps<{
  visible: boolean
  features: FeatureProperty[]
  position: { x: number; y: number }
}>()

const emit = defineEmits<{
  close: []
}>()

const popupStyle = computed(() => ({
  left: `${props.position.x}px`,
  top: `${props.position.y}px`
}))

function formatValue(value: any): string {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function close() {
  emit('close')
}
</script>

<style scoped lang="scss">
.feature-info-popup {
  position: absolute;
  z-index: 2000;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 300px;
  max-width: 450px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}

.popup-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.popup-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.no-feature {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 20px;
  font-size: 13px;
}

.features-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feature-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
}

.feature-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.layer-name {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.properties-section {
  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-regular);
    margin-bottom: 8px;
    text-transform: uppercase;
  }
}

.property-value {
  word-break: break-word;
  font-size: 13px;
}

:deep(.el-descriptions__cell) {
  padding: 6px 8px !important;
}

:deep(.el-descriptions__label) {
  font-weight: 500;
  width: 120px;
}
</style>
