<template>
  <div class="data-management-view">
    <div class="view-header">
      <h2>{{ $t('data.title') }}</h2>
      <div class="header-actions">
        <el-button @click="showPostGISDialog = true">
          <el-icon><Connection /></el-icon>
          Add PostGIS Connection
        </el-button>
        <el-button type="primary" @click="showUploadDialog = true">
          <el-icon><Upload /></el-icon>
          Upload Files
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
      <el-table-column prop="name" label="Name" min-width="200">
        <template #default="{ row }">
          <div class="data-source-name">
            <el-icon><Document /></el-icon>
            <span>{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>
      
      <el-table-column prop="type" label="Type" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="getTypeColor(row.type)">
            {{ row.type }}
          </el-tag>
        </template>
      </el-table-column>
      
      <el-table-column prop="metadata.featureCount" label="Records" width="100" align="right">
        <template #default="{ row }">
          {{ row.metadata?.featureCount || 'N/A' }}
        </template>
      </el-table-column>
      
      <el-table-column prop="metadata.fileSize" label="Size" width="100">
        <template #default="{ row }">
          {{ formatFileSize(row.metadata?.fileSize) }}
        </template>
      </el-table-column>
      
      <el-table-column prop="createdAt" label="Uploaded" width="180">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      
      <el-table-column label="Actions" width="100" fixed="right">
        <template #default="{ row }">
          <el-popconfirm
            title="Are you sure to delete this data source?"
            @confirm="handleDelete(row.id)"
          >
            <template #reference>
              <el-button size="small" type="danger" text>
                Delete
              </el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
    
    <el-empty 
      v-if="!dataSourceStore.isLoading && dataSourceStore.dataSources.length === 0"
      description="No data sources yet. Upload your first file!"
      :image-size="120"
    >
      <el-button type="primary" @click="showUploadDialog = true">
        Upload Files
      </el-button>
    </el-empty>
    
    <!-- Upload Dialog -->
    <el-dialog
      v-model="showUploadDialog"
      title="Upload Data Files"
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
          Drop files here or <em>click to upload</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            Supported formats: Shapefile (.shp, .shx, .dbf, .prj), GeoJSON, GeoTIFF, CSV<br/>
            Maximum file size: 100MB per file
          </div>
        </template>
      </el-upload>
      
      <!-- Upload Progress -->
      <div v-if="dataSourceStore.uploadTasks.length > 0" class="upload-progress">
        <h4>Upload Progress</h4>
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
        <el-button @click="handleCancelUpload">Cancel</el-button>
        <el-button 
          type="primary" 
          :loading="isUploading"
          :disabled="selectedFiles.length === 0"
          @click="handleUploadFiles"
        >
          Upload ({{ selectedFiles.length }})
        </el-button>
      </template>
    </el-dialog>
    
    <!-- PostGIS Connection Dialog -->
    <el-dialog
      v-model="showPostGISDialog"
      title="Add PostGIS Connection"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="postGISForm" label-width="120px" ref="postGISFormRef">
        <el-form-item label="Connection Name" required>
          <el-input v-model="postGISForm.name" placeholder="My PostGIS Database" />
        </el-form-item>
        
        <el-form-item label="Host" required>
          <el-input v-model="postGISForm.host" placeholder="localhost" />
        </el-form-item>
        
        <el-form-item label="Port">
          <el-input-number v-model="postGISForm.port" :min="1" :max="65535" style="width: 100%" />
        </el-form-item>
        
        <el-form-item label="Database" required>
          <el-input v-model="postGISForm.database" placeholder="gis_database" />
        </el-form-item>
        
        <el-form-item label="Username" required>
          <el-input v-model="postGISForm.user" placeholder="postgres" />
        </el-form-item>
        
        <el-form-item label="Password" required>
          <el-input 
            v-model="postGISForm.password" 
            type="password" 
            show-password
            placeholder="Enter password"
          />
        </el-form-item>
        
        <el-form-item label="Schema">
          <el-input v-model="postGISForm.schema" placeholder="public" />
          <div class="form-tip">Default: public</div>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="handleCancelPostGIS">Cancel</el-button>
        <el-button type="primary" @click="handleSubmitPostGIS" :loading="isConnecting">
          Connect & Register
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useDataSourceStore } from '@/stores/dataSources'
import { ElMessage } from 'element-plus'
import { Upload, Document, UploadFilled, Connection } from '@element-plus/icons-vue'
import type { UploadUserFile } from 'element-plus'

const dataSourceStore = useDataSourceStore()

const showUploadDialog = ref(false)
const showPostGISDialog = ref(false)
const selectedFiles = ref<File[]>([])
const isUploading = ref(false)
const isConnecting = ref(false)

// PostGIS Connection Form
const postGISFormRef = ref()
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
import { onMounted } from 'vue'
onMounted(() => {
  dataSourceStore.loadDataSources()
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
    ElMessage.error(`File ${file.name} exceeds 100MB limit`)
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
    ElMessage.error(`File type ${ext} is not supported`)
    return false
  }
  
  return true
}

async function handleUploadFiles() {
  if (selectedFiles.value.length === 0) return
  
  isUploading.value = true
  
  try {
    await dataSourceStore.uploadMultipleFiles(selectedFiles.value)
    ElMessage.success(`Successfully uploaded ${selectedFiles.value.length} file(s)`)
    
    // Reset
    selectedFiles.value = []
    showUploadDialog.value = false
    dataSourceStore.clearCompletedUploads()
  } catch (error) {
    ElMessage.error('Some files failed to upload')
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
    ElMessage.error('Please fill in all required fields')
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
      ElMessage.success(`Connected successfully! Registered ${result.dataSources?.length || 0} tables`)
      
      // Reset form and close dialog
      resetPostGISForm()
      showPostGISDialog.value = false
      
      // Reload data sources to show newly registered tables
      await dataSourceStore.loadDataSources()
    } else {
      ElMessage.error(result.error || 'Failed to connect to PostGIS')
    }
  } catch (error) {
    console.error('PostGIS connection error:', error)
    ElMessage.error('Failed to connect to PostGIS database')
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
    ElMessage.success('Data source deleted')
  } catch (error) {
    ElMessage.error('Failed to delete data source')
  }
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

function formatFileSize(bytes: number): string {
  if (!bytes) return 'N/A'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`
  }
  const kb = bytes / 1024
  return `${kb.toFixed(2)} KB`
}

function formatDate(dateString: string): string {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped lang="scss">
.data-management-view {
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
    color: var(--el-text-color-primary);
  }
  
  .header-actions {
    display: flex;
    gap: 12px;
  }
}

.data-source-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.upload-progress {
  margin-top: 24px;
  
  h4 {
    margin-bottom: 12px;
    color: var(--el-text-color-regular);
  }
}

.upload-task {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.task-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.task-name {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.task-error {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-color-danger);
}

.preview-content {
  max-height: 400px;
  overflow-y: auto;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
