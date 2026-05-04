<template>
  <div class="tool-library-view">
    <div class="view-header">
      <h2>{{ $t('tools.title') || 'Tool Library' }}</h2>
      <el-input
        v-model="searchQuery"
        placeholder="Search tools..."
        prefix-icon="Search"
        style="width: 300px"
        clearable
      />
    </div>
    
    <!-- Tools Grid -->
    <div class="tools-grid" v-loading="toolStore.isLoading">
      <el-card 
        v-for="tool in filteredTools" 
        :key="tool.id"
        class="tool-card"
        shadow="hover"
      >
        <div class="tool-header">
          <el-icon :size="32" color="#409eff"><component :is="getToolIcon(tool.category)" /></el-icon>
          <el-tag size="small" :type="getCategoryColor(tool.category)">
            {{ tool.category }}
          </el-tag>
        </div>
        
        <h3 class="tool-name">{{ tool.name }}</h3>
        <p class="tool-description">{{ tool.description }}</p>
        
        <div class="tool-actions">
          <el-button 
            type="primary" 
            size="small"
            @click="handleExecuteTool(tool)"
          >
            Execute
          </el-button>
        </div>
      </el-card>
      
      <el-empty 
        v-if="!toolStore.isLoading && filteredTools.length === 0"
        description="No tools found"
        :image-size="120"
      />
    </div>
    
    <!-- Tool Execution Dialog -->
    <el-dialog
      v-model="showExecutionDialog"
      :title="`Execute: ${selectedTool?.name}`"
      width="700px"
      :close-on-click-modal="false"
    >
      <div v-if="selectedTool" class="execution-form">
        <el-alert
          :title="selectedTool.description"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 20px"
        />
        
        <!-- Dynamic Parameter Form -->
        <el-form :model="executionParams" label-width="120px">
          <el-form-item 
            v-for="param in selectedTool.inputSchema" 
            :key="param.name"
            :label="param.name"
            :required="param.required"
          >
            <!-- String input -->
            <el-input 
              v-if="param.type === 'string'"
              v-model="executionParams[param.name]"
              :placeholder="param.description || `Enter ${param.name}`"
            />
            
            <!-- Number input -->
            <el-input-number 
              v-else-if="param.type === 'number'"
              v-model="executionParams[param.name]"
              :min="param.validation?.min"
              :max="param.validation?.max"
              style="width: 100%"
            />
            
            <!-- Boolean toggle -->
            <el-switch 
              v-else-if="param.type === 'boolean'"
              v-model="executionParams[param.name]"
            />
            
            <!-- Object/JSON input -->
            <el-input 
              v-else-if="param.type === 'object'"
              v-model="executionParams[param.name]"
              type="textarea"
              :rows="4"
              :placeholder="'Enter JSON object'"
            />
            
            <!-- Data source selector -->
            <el-select 
              v-else-if="param.type === 'data_reference'"
              v-model="executionParams[param.name]"
              placeholder="Select data source"
              style="width: 100%"
            >
              <el-option
                v-for="ds in dataSourceStore.dataSources"
                :key="ds.id"
                :label="ds.name"
                :value="ds.id"
              />
            </el-select>
            
            <!-- Array input -->
            <el-input 
              v-else-if="param.type === 'array'"
              v-model="executionParams[param.name]"
              type="textarea"
              :rows="3"
              :placeholder="'Enter comma-separated values'"
            />
            
            <div v-if="param.description" class="param-help">
              {{ param.description }}
            </div>
          </el-form-item>
        </el-form>
        
        <!-- Execution Result -->
        <div v-if="toolStore.executionResult" class="execution-result">
          <h4>Result</h4>
          <pre>{{ JSON.stringify(toolStore.executionResult, null, 2) }}</pre>
          
          <div class="result-actions">
            <el-button 
              type="success" 
              @click="handleAddResultToMap"
            >
              Add to Map
            </el-button>
            <el-button @click="toolStore.clearExecutionResult">
              Clear
            </el-button>
          </div>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="showExecutionDialog = false">Cancel</el-button>
        <el-button 
          type="primary" 
          :loading="toolStore.executingToolId === selectedTool?.id"
          @click="handleConfirmExecution"
        >
          Execute
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useToolStore } from '@/stores/tools'
import { useDataSourceStore } from '@/stores/dataSources'
import { useMapStore } from '@/stores/map'
import { ElMessage } from 'element-plus'
import { Search, Operation, DataAnalysis, Location, TrendCharts } from '@element-plus/icons-vue'
import type { Tool } from '@/types'

const toolStore = useToolStore()
const dataSourceStore = useDataSourceStore()
const mapStore = useMapStore()

const searchQuery = ref('')
const showExecutionDialog = ref(false)
const selectedTool = ref<Tool | null>(null)
const executionParams = ref<Record<string, any>>({})

// Lifecycle
import { onMounted } from 'vue'
onMounted(() => {
  toolStore.loadTools()
  dataSourceStore.loadDataSources()
})

// Computed
const filteredTools = computed(() => {
  if (!searchQuery.value) return toolStore.tools
  
  const query = searchQuery.value.toLowerCase()
  return toolStore.tools.filter(tool => 
    tool.name.toLowerCase().includes(query) ||
    tool.description.toLowerCase().includes(query) ||
    tool.category.toLowerCase().includes(query)
  )
})

// Methods
function handleExecuteTool(tool: Tool) {
  selectedTool.value = tool
  executionParams.value = {}
  
  // Initialize params with defaults
  if (tool.inputSchema) {
    tool.inputSchema.forEach((param: any) => {
      executionParams.value[param.name] = param.default ?? ''
    })
  }
  
  showExecutionDialog.value = true
}

async function handleConfirmExecution() {
  if (!selectedTool.value) return
  
  try {
    await toolStore.executeTool(selectedTool.value.id, executionParams.value)
    ElMessage.success('Tool executed successfully')
  } catch (error: any) {
    ElMessage.error(error.message || 'Execution failed')
  }
}

function handleAddResultToMap() {
  if (!toolStore.executionResult || !selectedTool.value) return
  
  // Determine how to add result to map based on tool type
  const result = toolStore.executionResult
  
  if (result.geojson) {
    // Result contains GeoJSON
    mapStore.addLayer({
      id: `result-${selectedTool.value.id}-${Date.now()}`,
      type: 'geojson',
      url: URL.createObjectURL(new Blob([JSON.stringify(result.geojson)], { type: 'application/json' })),
      visible: true,
      opacity: 0.7,
      style: {
        fillColor: '#67c23a',
        fillOpacity: 0.5
      }
    })
    
    ElMessage.success('Result added to map')
    showExecutionDialog.value = false
  } else if (result.dataSourceId) {
    // Result is a new data source
    const ds = dataSourceStore.dataSources.find(d => d.id === result.dataSourceId)
    if (ds) {
      mapStore.addLayer({
        id: `layer-${ds.id}`,
        type: 'geojson',
        url: `/api/datasources/${ds.id}/geojson`,
        visible: true,
        opacity: 0.7
      })
      
      ElMessage.success('Result added to map')
      showExecutionDialog.value = false
    }
  } else {
    ElMessage.warning('Result cannot be visualized on map')
  }
}

// Utility functions
function getToolIcon(category: string) {
  const icons: Record<string, any> = {
    'analysis': DataAnalysis,
    'statistics': TrendCharts,
    'spatial': Location,
    'processing': Operation
  }
  return icons[category] || Operation
}

function getCategoryColor(category: string): 'primary' | 'success' | 'warning' | 'info' {
  const colors: Record<string, any> = {
    'analysis': 'primary',
    'statistics': 'success',
    'spatial': 'warning',
    'processing': 'info'
  }
  return colors[category] || ''
}
</script>

<style scoped lang="scss">
.tool-library-view {
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

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.tool-card {
  transition: transform 0.2s;
  
  &:hover {
    transform: translateY(-4px);
  }
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.tool-name {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: #303133;
}

.tool-description {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.5;
  min-height: 42px;
}

.tool-actions {
  display: flex;
  justify-content: flex-end;
}

.execution-form {
  max-height: 60vh;
  overflow-y: auto;
}

.param-help {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.execution-result {
  margin-top: 24px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  
  h4 {
    margin: 0 0 12px 0;
    color: #303133;
  }
  
  pre {
    max-height: 300px;
    overflow: auto;
    background: #282c34;
    color: #abb2bf;
    padding: 12px;
    border-radius: 4px;
    font-size: 12px;
  }
}

.result-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
</style>
