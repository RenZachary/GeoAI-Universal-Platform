<template>
  <div class="data-management-view">
    <div class="view-header">
      <h2>{{ $t('data.title') }}</h2>
      <div class="header-actions">
        <el-button @click="showPostGISDialog = true">
          <el-icon><Connection /></el-icon>
          {{ $t('data.postgis.addConnection') }}
        </el-button>
        <el-button type="primary" @click="showUploadDialog = true">
          <el-icon><Upload /></el-icon>
          {{ $t('data.uploadTitle') }}
        </el-button>
      </div>
    </div>
    
    <!-- Data Sources Table -->
    <el-table 
      :data="dataSourceStore.dataSources" 
      v-loading="dataSourceStore.isLoading"
      stripe
      style="width: 100%"
    >
      <el-table-column prop="name" :label="$t('data.name')" min-width="200">
        <template #default="{ row }">
          <div class="data-source-name">
            <el-icon><Document /></el-icon>
            <span>{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>
      
      <el-table-column prop="type" :label="$t('data.type')" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="getTypeColor(row.type)">
            {{ row.type }}
          </el-tag>
        </template>
      </el-table-column>
      
      <el-table-column prop="metadata.featureCount" :label="$t('map.features')" width="100" align="right">
        <template #default="{ row }">
          {{ row.metadata?.featureCount || 'N/A' }}
        </template>
      </el-table-column>
      
      <el-table-column prop="metadata.fileSize" :label="$t('data.size')" width="100">
        <template #default="{ row }">
          {{ formatFileSize(row.metadata?.fileSize) }}
        </template>
      </el-table-column>
      
      <el-table-column prop="createdAt" :label="$t('data.uploadedAt')" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.createdAt) }}
        </template>
      </el-table-column>
      
      <el-table-column :label="$t('common.actions')" fixed="right">
        <template #default="{ row }">
          <div class="action-buttons">
            <el-button size="small" type="primary" text @click="handleViewMetadata(row)">
              <el-icon><InfoFilled /></el-icon>
              {{ $t('data.viewMetadata') }}
            </el-button>
            <!-- Only show delete button for non-PostGIS data sources -->
            <el-popconfirm
              v-if="row.type !== 'postgis'"
              :title="$t('data.deleteConfirm', { name: row.name })"
              @confirm="handleDelete(row.id)"
            >
              <template #reference>
                <el-button size="small" type="danger" text>
                  {{ $t('common.delete') }}
                </el-button>
              </template>
            </el-popconfirm>
            <!-- Show tooltip for PostGIS tables -->
            <el-tooltip v-else :content="$t('data.postgis.messages.cannotDeleteTable')" placement="top">
              <el-button size="small" type="info" text disabled>
                {{ $t('common.delete') }}
              </el-button>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
    </el-table>
    
    <!-- PostGIS Connections Section -->
    <div class="connections-section">
      <h3>{{ $t('data.postgis.connections') }}</h3>
      
      <el-empty 
        v-if="postgisConnections.length === 0"
        description="No PostGIS connections registered yet. Click 'Add PostGIS Connection' button above to get started."
        :image-size="60"
      />
      
      <el-table v-else :data="postgisConnections" stripe style="width: 100%">
        <el-table-column prop="name" label="Connection Name" min-width="200">
          <template #default="{ row }">
            <div class="connection-name">
              <el-icon><Connection /></el-icon>
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column prop="host" label="Host" width="150">
          <template #default="{ row }">
            {{ row.host }}
          </template>
        </el-table-column>
        
        <el-table-column prop="database" label="Database" width="150">
          <template #default="{ row }">
            {{ row.database }}
          </template>
        </el-table-column>
        
        <el-table-column prop="tableCount" label="Tables" width="100" align="right">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.tableCount }}</el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="Actions" width="150" align="center">
          <template #default="{ row }">
            <el-popconfirm
              :title="`Remove connection '${row.name}' and all ${row.tableCount} tables? This cannot be undone.`"
              @confirm="handleRemoveConnection(row.id)"
            >
              <template #reference>
                <el-button size="small" type="danger" text>
                  <el-icon><Delete /></el-icon>
                  Remove Connection
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </div>
    
    <el-empty 
      v-if="!dataSourceStore.isLoading && dataSourceStore.dataSources.length === 0"
      :description="$t('data.noDataSources')"
      :image-size="120"
    >
      <el-button type="primary" @click="showUploadDialog = true">
        {{ $t('data.uploadTitle') }}
      </el-button>
    </el-empty>
    
    <!-- Upload Dialog -->
    <el-dialog
      v-model="showUploadDialog"
      :title="$t('data.uploadTitle')"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-upload
        ref="uploadRef"
        drag
        multiple
        :auto-upload="false"
        :on-change="handleFileSelect"
        :before-upload="beforeUpload"
        accept=".shp,.shx,.dbf,.prj,.geojson,.json,.tif,.tiff,.csv"
        :limit="10"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          {{ $t('upload.dropText') }} <em>{{ $t('upload.clickText') }}</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            {{ $t('upload.supportedFormats') }}<br/>
            {{ $t('upload.maxSize') }}
          </div>
        </template>
      </el-upload>
      
      <!-- Upload Progress -->
      <div v-if="dataSourceStore.uploadTasks.length > 0" class="upload-progress">
        <h4>{{ $t('upload.uploadProgress') }}</h4>
        <div 
          v-for="task in dataSourceStore.uploadTasks" 
          :key="task.id"
          class="upload-task"
        >
          <div class="task-info">
            <span class="task-name">{{ task.fileName }}</span>
            <el-tag size="small" :type="getTaskStatusColor(task.status)">
              {{ task.status }}
            </el-tag>
          </div>
          <el-progress 
            :percentage="task.progress" 
            :status="task.status === 'error' ? 'exception' : undefined"
          />
          <div v-if="task.error" class="task-error">{{ task.error }}</div>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="handleCancelUpload">{{ $t('common.cancel') }}</el-button>
        <el-button 
          type="primary" 
          :loading="isUploading"
          :disabled="selectedFiles.length === 0"
          @click="handleUploadFiles"
        >
          {{ $t('upload.uploadButton') }} ({{ selectedFiles.length }})
        </el-button>
      </template>
    </el-dialog>
    
    <!-- PostGIS Connection Dialog -->
    <el-dialog
      v-model="showPostGISDialog"
      :title="$t('data.postgis.dialogTitle')"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="postGISForm" label-width="120px" ref="postGISFormRef">
        <el-form-item :label="$t('data.postgis.connectionName')" required>
          <el-input v-model="postGISForm.name" :placeholder="$t('data.postgis.placeholder.connectionName')" />
        </el-form-item>
        
        <el-form-item :label="$t('data.postgis.host')" required>
          <el-input v-model="postGISForm.host" :placeholder="$t('data.postgis.placeholder.host')" />
        </el-form-item>
        
        <el-form-item :label="$t('data.postgis.port')">
          <el-input-number v-model="postGISForm.port" :min="1" :max="65535" style="width: 100%" />
        </el-form-item>
        
        <el-form-item :label="$t('data.postgis.database')" required>
          <el-input v-model="postGISForm.database" :placeholder="$t('data.postgis.placeholder.database')" />
        </el-form-item>
        
        <el-form-item :label="$t('data.postgis.username')" required>
          <el-input v-model="postGISForm.user" :placeholder="$t('data.postgis.placeholder.username')" />
        </el-form-item>
        
        <el-form-item :label="$t('data.postgis.password')" required>
          <el-input 
            v-model="postGISForm.password" 
            type="password" 
            show-password
            :placeholder="$t('data.postgis.placeholder.password')"
          />
        </el-form-item>
        
        <el-form-item :label="$t('data.postgis.schema')">
          <el-input v-model="postGISForm.schema" :placeholder="$t('data.postgis.placeholder.schema')" />
          <div class="form-tip">{{ $t('data.postgis.schemaTip') }}</div>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="handleCancelPostGIS">{{ $t('data.postgis.cancel') }}</el-button>
        <el-button type="primary" @click="handleSubmitPostGIS" :loading="isConnecting">
          {{ $t('data.postgis.connectAndRegister') }}
        </el-button>
      </template>
    </el-dialog>
    
    <!-- Metadata View Dialog -->
    <el-dialog
      v-model="showMetadataDialog"
      :title="selectedDataSource?.name || 'Metadata'"
      width="700px"
    >
      <div v-if="selectedDataSource" class="metadata-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item :label="$t('data.name')">
            {{ selectedDataSource.name }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('data.type')">
            <el-tag size="small" :type="getTypeColor(selectedDataSource.type)">
              {{ selectedDataSource.type }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('data.uploadedAt')">
            {{ formatDateTime(selectedDataSource.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('data.size')">
            {{ formatFileSize(selectedDataSource.metadata?.fileSize) }}
          </el-descriptions-item>
        </el-descriptions>
        
        <el-divider>{{ $t('data.metadata.spatialInfo') }}</el-divider>
        
        <el-descriptions :column="2" border>
          <el-descriptions-item :label="$t('data.features')">
            {{ selectedDataSource.metadata?.featureCount || 'N/A' }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('data.geometryType')">
            {{ selectedDataSource.metadata?.geometryType || 'N/A' }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('data.crs')" :span="2">
            {{ selectedDataSource.metadata?.crs || 'N/A' }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('data.bbox')" :span="2" v-if="selectedDataSource.metadata?.bbox">
            <code class="bbox-code">
              [{{ selectedDataSource.metadata.bbox.join(', ') }}]
            </code>
          </el-descriptions-item>
        </el-descriptions>
        
        <el-divider v-if="selectedDataSource.metadata?.fields && selectedDataSource.metadata.fields.length > 0">
          {{ $t('data.fields') }} ({{ selectedDataSource.metadata.fields.length }})
        </el-divider>
        
        <el-table 
          v-if="selectedDataSource.metadata?.fields && selectedDataSource.metadata.fields.length > 0"
          :data="selectedDataSource.metadata.fields" 
          stripe
          max-height="300"
        >
          <el-table-column prop="name" :label="$t('data.fieldName')" min-width="150" />
          <el-table-column prop="type" :label="$t('data.fieldType')" width="120">
            <template #default="{ row }">
              <el-tag size="small" type="info">{{ row.type }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        
        <el-empty 
          v-else
          :description="$t('data.noFields')"
          :image-size="80"
        />
      </div>
      
      <template #footer>
        <el-button @click="showMetadataDialog = false">{{ $t('common.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDataSourceStore } from '@/stores/dataSources'
import { ElMessage } from 'element-plus'
import { Upload, Document, UploadFilled, Connection, InfoFilled, Delete } from '@element-plus/icons-vue'
import type { UploadUserFile } from 'element-plus'
import * as dataSourceService from '@/services/dataSource'
import { formatFileSize, formatDateTime } from '@/utils/formatters'

const { t } = useI18n()
const dataSourceStore = useDataSourceStore()

const showUploadDialog = ref(false)
const showPostGISDialog = ref(false)
const showMetadataDialog = ref(false)
const selectedDataSource = ref<any>(null)
const selectedFiles = ref<File[]>([])
const isUploading = ref(false)
const isConnecting = ref(false)
const postgisConnections = ref<Array<{
  id: string
  name: string
  host: string
  database: string
  tableCount: number
}>>([])

// PostGIS Connection Form
const postGISForm = reactive({
  name: '',
  host: 'localhost',
  port: 5432,
  database: '',
  user: 'postgres',
  password: '',
  schema: 'public'
})

// Lifecycle
onMounted(() => {
  dataSourceStore.loadDataSources()
  loadPostGISConnections()
})

// Methods
function handleFileSelect(file: UploadUserFile) {
  if (file.raw) {
    selectedFiles.value.push(file.raw)
  }
}

function beforeUpload(file: File) {
  const maxSize = 100 * 1024 * 1024 // 100MB
  if (file.size > maxSize) {
    ElMessage.error(t('upload.fileTooLarge', { name: file.name }))
    return false
  }
  
  const allowedTypes = [
    '.shp', '.shx', '.dbf', '.prj',
    '.geojson', '.json',
    '.tif', '.tiff',
    '.csv'
  ]
  
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!allowedTypes.includes(ext)) {
    ElMessage.error(t('plugins.unsupportedType', { ext }))
    return false
  }
  
  return true
}

async function handleUploadFiles() {
  if (selectedFiles.value.length === 0) return
  
  isUploading.value = true
  
  try {
    await dataSourceStore.uploadMultipleFiles(selectedFiles.value)
    ElMessage.success(t('data.uploadSuccess'))
    
    // Reset
    selectedFiles.value = []
    showUploadDialog.value = false
    dataSourceStore.clearCompletedUploads()
  } catch (error) {
    ElMessage.error(t('upload.uploadFailed'))
  } finally {
    isUploading.value = false
  }
}

function handleCancelUpload() {
  selectedFiles.value = []
  showUploadDialog.value = false
  dataSourceStore.clearCompletedUploads()
}

async function handleSubmitPostGIS() {
  // Validate required fields
  if (!postGISForm.host || !postGISForm.database || !postGISForm.user || !postGISForm.password) {
    ElMessage.error(t('data.postgis.validation.requiredFields'))
    return
  }
  
  isConnecting.value = true
  try {
    // Call backend to register PostGIS connection
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/data-sources/postgis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Browser-Fingerprint': localStorage.getItem('browser_fingerprint') || ''
      },
      body: JSON.stringify({
        name: postGISForm.name || `${postGISForm.host}/${postGISForm.database}`,
        host: postGISForm.host,
        port: postGISForm.port,
        database: postGISForm.database,
        user: postGISForm.user,
        password: postGISForm.password,
        schema: postGISForm.schema || 'public'
      })
    })
    
    const result = await response.json()
    
    if (result.success) {
      const count = result.dataSources?.length || 0
      ElMessage.success(t('data.postgis.messages.connected', { count }))
      
      // Reset form and close dialog
      resetPostGISForm()
      showPostGISDialog.value = false
      
      // Reload data sources to show newly registered tables
      await dataSourceStore.loadDataSources()
    } else {
      ElMessage.error(result.error || t('data.postgis.messages.connectionFailed'))
    }
  } catch (error) {
    console.error('PostGIS connection error:', error)
    ElMessage.error(t('data.postgis.messages.connectionError'))
  } finally {
    isConnecting.value = false
  }
}

function handleCancelPostGIS() {
  resetPostGISForm()
  showPostGISDialog.value = false
}

function resetPostGISForm() {
  postGISForm.name = ''
  postGISForm.host = 'localhost'
  postGISForm.port = 5432
  postGISForm.database = ''
  postGISForm.user = 'postgres'
  postGISForm.password = ''
  postGISForm.schema = 'public'
}

async function handleDelete(id: string) {
  try {
    await dataSourceStore.deleteDataSource(id)
    ElMessage.success(t('data.deleteSuccess'))
  } catch (error) {
    // Check if error is about PostGIS deletion restriction
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('PostGIS') || errorMessage.includes('connection')) {
      ElMessage.warning(t('data.postgis.messages.cannotDeleteTable'))
    } else {
      ElMessage.error(t('plugins.operationFailed'))
    }
  }
}

async function loadPostGISConnections() {
  try {
    postgisConnections.value = await dataSourceService.getPostGISConnections()
  } catch (error) {
    console.error('Failed to load PostGIS connections:', error)
  }
}

async function handleRemoveConnection(connectionId: string) {
  try {
    await dataSourceService.removePostGISConnection(connectionId)
    ElMessage.success('PostGIS connection removed successfully')
    
    // Reload both connections and data sources
    await loadPostGISConnections()
    await dataSourceStore.loadDataSources()
  } catch (error) {
    ElMessage.error('Failed to remove connection')
  }
}

function handleViewMetadata(dataSource: any) {
  selectedDataSource.value = dataSource
  showMetadataDialog.value = true
}

// Utility functions
function getTypeColor(type: string): 'success' | 'warning' | 'info' | 'primary' {
  const colors: Record<string, any> = {
    'geojson': 'success',
    'shapefile': 'warning',
    'postgis': 'primary',
    'raster': 'info',
    'csv': 'info'
  }
  return colors[type] || 'info'
}

function getTaskStatusColor(status: string): 'success' | 'warning' | 'danger' | 'info' {
  const colors: Record<string, any> = {
    'pending': 'info',
    'uploading': 'warning',
    'success': 'success',
    'error': 'danger'
  }
  return colors[status] || 'info'
}
</script>

<style scoped lang="scss">
@use '@/assets/dmView.scss';
</style>
