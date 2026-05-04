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
      </el-card>
      
      <el-empty 
        v-if="!toolStore.isLoading && filteredTools.length === 0"
        description="No tools found"
        :image-size="120"
      />
    </div>
    

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useToolStore } from '@/stores/tools'
import { ElMessage } from 'element-plus'
import { Search, Operation, DataAnalysis, Location, TrendCharts } from '@element-plus/icons-vue'
import type { Tool } from '@/types'

const toolStore = useToolStore()

const searchQuery = ref('')

// Lifecycle
import { onMounted } from 'vue'
onMounted(() => {
  toolStore.loadTools()
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
  return colors[category] || 'info'
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
    color: var(--el-text-color-primary);
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
  margin-bottom: 8px;
}

.tool-name {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: var(--el-text-color-primary);
}

.tool-description {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
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
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.execution-result {
  margin-top: 24px;
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  
  h4 {
    margin: 0 0 12px 0;
    color: var(--el-text-color-primary);
  }
  
  pre {
    max-height: 300px;
    overflow: auto;
    background: var(--el-bg-color-page);
    color: var(--el-text-color-regular);
    padding: 12px;
    border-radius: 4px;
    font-size: 12px;
    border: 1px solid var(--el-border-color);
  }
}

.result-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
</style>
