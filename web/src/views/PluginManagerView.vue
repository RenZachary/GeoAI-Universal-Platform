<template>
  <div class="plugin-manager-view">
    <div class="view-header">
      <h2>{{ $t('plugins.title') }}</h2>
      <el-button type="primary" @click="showUploadDialog = true">
        <el-icon><Upload /></el-icon>
        {{ $t('plugins.upload') }}
      </el-button>
    </div>
    
    <!-- Plugins List -->
    <div class="plugins-list" v-loading="pluginStore.isLoading">
      <el-card 
        v-for="plugin in pluginStore.plugins" 
        :key="plugin.id"
        class="plugin-card"
        shadow="hover"
      >
        <div class="plugin-header">
          <div class="plugin-info">
            <h3 class="plugin-name">{{ plugin.name }}</h3>
            <p class="plugin-version">v{{ plugin.version }}</p>
          </div>
          
          <el-switch
            v-model="plugin.enabled"
            :active-text="$t('plugins.enabled')"
            :inactive-text="$t('plugins.disabled')"
            @change="(val: boolean) => handleTogglePlugin(plugin, val)"
          />
        </div>
        
        <p class="plugin-description">{{ plugin.description }}</p>
        
        <div class="plugin-meta">
          <el-tag size="small" :type="plugin.isBuiltin ? 'success' : 'warning'">
            {{ plugin.isBuiltin ? $t('plugins.builtin') : $t('plugins.custom') }}
          </el-tag>
          
          <span class="plugin-category">{{ plugin.category }}</span>
        </div>
        
        <div class="plugin-actions">
          <el-button 
            size="small" 
            text
            @click="handleViewDetails(plugin)"
          >
            {{ $t('plugins.viewDetails') }}
          </el-button>
          
          <el-button 
            v-if="!plugin.isBuiltin"
            size="small" 
            type="danger"
            text
            @click="handleDeletePlugin(plugin)"
          >
            {{ $t('plugins.delete') }}
          </el-button>
        </div>
      </el-card>
      
      <el-empty 
        v-if="!pluginStore.isLoading && pluginStore.plugins.length === 0"
        :description="$t('plugins.noPlugins')"
        :image-size="120"
      >
        <el-button type="primary" @click="showUploadDialog = true">
          {{ $t('plugins.upload') }}
        </el-button>
      </el-empty>
    </div>
    
    <!-- Upload Plugin Dialog -->
    <el-dialog
      v-model="showUploadDialog"
      :title="$t('plugins.uploadTitle')"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-upload
        drag
        :auto-upload="false"
        :on-change="handlePluginFileSelect"
        :before-upload="beforePluginUpload"
        accept=".zip,.js"
        :limit="1"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          {{ $t('plugins.dropText') }} <em>{{ $t('plugins.clickText') }}</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            {{ $t('plugins.supportedFormats') }}<br/>
            {{ $t('plugins.maxSize') }}
          </div>
        </template>
      </el-upload>
      
      <template #footer>
        <el-button @click="showUploadDialog = false">{{ $t('plugins.cancel') }}</el-button>
        <el-button 
          type="primary" 
          :loading="pluginStore.isUploading"
          :disabled="!selectedPluginFile"
          @click="handleUploadPlugin"
        >
          {{ $t('plugins.uploadButton') }}
        </el-button>
      </template>
    </el-dialog>
    
    <!-- Plugin Details Dialog -->
    <el-dialog
      v-model="showDetailsDialog"
      :title="selectedPlugin?.name || $t('plugins.pluginDetails')"
      width="600px"
    >
      <div v-if="selectedPlugin" class="plugin-details">
        <el-descriptions :column="1" border>
          <el-descriptions-item :label="$t('plugins.name')">
            {{ selectedPlugin.name }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('plugins.version')">
            {{ selectedPlugin.version }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('plugins.category')">
            {{ selectedPlugin.category }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('plugins.type')">
            <el-tag size="small" :type="selectedPlugin.isBuiltin ? 'success' : 'warning'">
              {{ selectedPlugin.isBuiltin ? $t('plugins.builtin') : $t('plugins.custom') }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('plugins.status')">
            <el-tag size="small" :type="selectedPlugin.enabled ? 'success' : 'info'">
              {{ selectedPlugin.enabled ? $t('plugins.enabled') : $t('plugins.disabled') }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('plugins.description')">
            {{ selectedPlugin.description }}
          </el-descriptions-item>
        </el-descriptions>
        
        <!-- Input Schema -->
        <div v-if="(selectedPlugin as any).inputSchema && (selectedPlugin as any).inputSchema.length > 0" class="schema-section">
          <h4>{{ $t('plugins.inputParameters') }}</h4>
          <el-table :data="(selectedPlugin as any).inputSchema" border>
            <el-table-column prop="name" :label="$t('plugins.name')" width="150" />
            <el-table-column prop="type" :label="$t('plugins.type')" width="120" />
            <el-table-column prop="required" :label="$t('plugins.required')" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.required ? 'danger' : 'info'">
                  {{ row.required ? $t('plugins.yes') : $t('plugins.no') }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="description" :label="$t('plugins.description')" />
          </el-table>
        </div>
        
        <!-- Output Schema -->
        <div v-if="(selectedPlugin as any).outputSchema" class="schema-section">
          <h4>{{ $t('plugins.output') }}</h4>
          <pre>{{ JSON.stringify((selectedPlugin as any).outputSchema, null, 2) }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginStore } from '@/stores/plugins'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, UploadFilled } from '@element-plus/icons-vue'
import type { Plugin } from '@/types'
import type { UploadUserFile } from 'element-plus'

const { t } = useI18n()
const pluginStore = usePluginStore()

const showUploadDialog = ref(false)
const showDetailsDialog = ref(false)
const selectedPluginFile = ref<File | null>(null)
const selectedPlugin = ref<Plugin | null>(null)

// Lifecycle
import { onMounted } from 'vue'
onMounted(() => {
  pluginStore.loadPlugins()
})

// Methods
function handlePluginFileSelect(file: UploadUserFile) {
  if (file.raw) {
    selectedPluginFile.value = file.raw
  }
}

function beforePluginUpload(file: File) {
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    ElMessage.error(t('plugins.fileTooLarge', { name: file.name }))
    return false
  }
  
  const allowedTypes = ['.zip', '.js']
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!allowedTypes.includes(ext)) {
    ElMessage.error(t('plugins.unsupportedType', { ext }))
    return false
  }
  
  return true
}

async function handleUploadPlugin() {
  if (!selectedPluginFile.value) return
  
  try {
    await pluginStore.uploadPlugin(selectedPluginFile.value)
    ElMessage.success(t('plugins.uploadSuccess'))
    
    // Reset
    selectedPluginFile.value = null
    showUploadDialog.value = false
  } catch (error: any) {
    ElMessage.error(error.message || t('plugins.uploadFailed'))
  }
}

async function handleTogglePlugin(plugin: Plugin, enabled: boolean) {
  try {
    if (enabled) {
      await pluginStore.enablePlugin(plugin.id)
      ElMessage.success(t('plugins.enableSuccess', { name: plugin.name }))
    } else {
      await pluginStore.disablePlugin(plugin.id)
      ElMessage.success(t('plugins.disableSuccess', { name: plugin.name }))
    }
  } catch (error: any) {
    ElMessage.error(error.message || t('plugins.operationFailed'))
    // Revert switch state
    plugin.enabled = !enabled
  }
}

function handleViewDetails(plugin: Plugin) {
  selectedPlugin.value = plugin
  showDetailsDialog.value = true
}

async function handleDeletePlugin(plugin: Plugin) {
  try {
    await ElMessageBox.confirm(
      t('plugins.deleteConfirm', { name: plugin.name }),
      t('plugins.confirmDelete'),
      {
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )
    
    await pluginStore.deletePlugin(plugin.id)
    ElMessage.success(t('plugins.deleteSuccess'))
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete plugin:', error)
      ElMessage.error(t('plugins.deleteFailed'))
    }
    // User cancelled
  }
}
</script>

<style scoped lang="scss">
.plugin-manager-view {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  
  h2 {
    margin: 0;
    font-size: 24px;
    color: #303133;
  }
}

.plugins-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.plugin-card {
  transition: transform 0.2s;
  
  &:hover {
    transform: translateY(-4px);
  }
}

.plugin-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.plugin-info {
  flex: 1;
}

.plugin-name {
  margin: 0 0 4px 0;
  font-size: 18px;
  color: #303133;
}

.plugin-version {
  margin: 0;
  font-size: 12px;
  color: #909399;
}

.plugin-description {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.5;
  min-height: 42px;
}

.plugin-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.plugin-category {
  font-size: 12px;
  color: #909399;
}

.plugin-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.plugin-details {
  max-height: 60vh;
  overflow-y: auto;
}

.schema-section {
  margin-top: 24px;
  
  h4 {
    margin: 0 0 12px 0;
    color: #303133;
    font-size: 16px;
  }
  
  pre {
    background: #f5f7fa;
    padding: 12px;
    border-radius: 4px;
    font-size: 12px;
    overflow-x: auto;
  }
}
</style>
