<template>
  <div class="template-manager-view">
    <div class="view-header">
      <h2>{{ $t('templates.title') }}</h2>
      <el-button type="primary" @click="handleCreateTemplate">
        <el-icon><Plus /></el-icon>
        New Template
      </el-button>
    </div>
    
    <!-- Templates List -->
    <div class="templates-list" v-loading="templateStore.isLoading">
      <el-card 
        v-for="template in templateStore.templates" 
        :key="template.id"
        class="template-card"
        shadow="hover"
      >
        <div class="template-header">
          <h3 class="template-name">{{ template.name }}</h3>
          
          <div class="template-actions">
            <el-button 
              size="small" 
              text
              @click="handleEditTemplate(template)"
            >
              Edit
            </el-button>
            <el-popconfirm
              title="Are you sure to delete this template?"
              @confirm="handleDeleteTemplate(template.id)"
            >
              <template #reference>
                <el-button size="small" type="danger" text>
                  Delete
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
        
        <p class="template-description">{{ template.description }}</p>
        
        <div class="template-meta">
          <span class="template-updated">
            Updated: {{ formatDate(template.updatedAt) }}
          </span>
        </div>
      </el-card>
      
      <el-empty 
        v-if="!templateStore.isLoading && templateStore.templates.length === 0"
        description="No templates yet"
        :image-size="120"
      >
        <el-button type="primary" @click="handleCreateTemplate">
          Create Template
        </el-button>
      </el-empty>
    </div>
    
    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="showEditorDialog"
      :title="editingTemplate ? 'Edit Template' : 'New Template'"
      width="900px"
      :close-on-click-modal="false"
    >
      <el-form :model="templateForm" label-width="100px">
        <el-form-item label="Name" required>
          <el-input v-model="templateForm.name" placeholder="Template name" />
        </el-form-item>
        
        <el-form-item label="Category">
          <el-select v-model="templateForm.category" placeholder="Select category" style="width: 100%" disabled>
            <el-option label="General" value="chat" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="Description">
          <el-input 
            v-model="templateForm.description" 
            type="textarea"
            :rows="2"
            placeholder="Brief description of this template"
          />
        </el-form-item>
        
        <el-form-item label="Content" required>
          <el-input 
            v-model="templateForm.content" 
            type="textarea"
            :rows="15"
            placeholder="Enter template content with variables like {{variable}}"
            class="template-editor"
          />
          <div class="editor-help">
            Use {`{{`}variable{`}}`} syntax for dynamic values. Example: {`{{`}query{`}}`}, {`{{`}data_source{`}}`}
          </div>
        </el-form-item>
        
        <el-form-item label="Variables">
          <el-tag 
            v-for="varName in extractedVariables" 
            :key="varName"
            closable
            @close="removeVariable(varName)"
            style="margin-right: 8px; margin-bottom: 8px"
          >
            {{ varName }}
          </el-tag>
          <span v-if="extractedVariables.length === 0" class="no-variables">
            No variables detected
          </span>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showEditorDialog = false">Cancel</el-button>
        <el-button type="primary" @click="handleSaveTemplate">
          Save Template
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTemplateStore } from '@/stores/templates'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { PromptTemplate } from '@/types'

const templateStore = useTemplateStore()

const showEditorDialog = ref(false)
const editingTemplate = ref<PromptTemplate | null>(null)
const templateForm = ref({
  name: '',
  description: '',
  content: '',
  category: 'chat'
})

// Lifecycle
import { onMounted } from 'vue'
onMounted(() => {
  templateStore.loadTemplates()
})

// Computed - Extract variables from template content
const extractedVariables = computed(() => {
  const matches = templateForm.value.content.match(/\{\{(\w+)\}\}/g)
  if (!matches) return []
  
  // Extract unique variable names
  const vars = matches.map(m => m.replace(/\{\{|\}\}/g, ''))
  return [...new Set(vars)]
})

// Methods
function handleCreateTemplate() {
  editingTemplate.value = null
  templateForm.value = {
    name: '',
    description: '',
    content: '',
    category: 'chat'
  }
  showEditorDialog.value = true
}

function handleEditTemplate(template: PromptTemplate) {
  editingTemplate.value = template
  templateForm.value = {
    name: template.name,
    description: template.description || '',
    content: template.content,
    category: 'chat'
  }
  showEditorDialog.value = true
}

async function handleSaveTemplate() {
  // Validation
  if (!templateForm.value.name.trim()) {
    ElMessage.error('Template name is required')
    return
  }
  
  if (!templateForm.value.content.trim()) {
    ElMessage.error('Template content is required')
    return
  }
  
  try {
    if (editingTemplate.value) {
      // Update existing
      await templateStore.updateTemplate(editingTemplate.value.id, {
        name: templateForm.value.name,
        description: templateForm.value.description,
        content: templateForm.value.content
      })
      ElMessage.success('Template updated')
    } else {
      // Create new
      await templateStore.createTemplate({
        name: templateForm.value.name,
        description: templateForm.value.description,
        content: templateForm.value.content,
        language: 'en-US',
        version: '1.0'
      })
      ElMessage.success('Template created')
    }
    
    showEditorDialog.value = false
  } catch (error: any) {
    ElMessage.error(error.message || 'Operation failed')
  }
}

async function handleDeleteTemplate(id: string) {
  try {
    await templateStore.deleteTemplate(id)
    ElMessage.success('Template deleted')
  } catch (error: any) {
    ElMessage.error(error.message || 'Delete failed')
  }
}

function removeVariable(varName: string) {
  // Remove all occurrences of this variable from content
  const regex = new RegExp(`\\{\\{${varName}\\}\\}`, 'g')
  templateForm.value.content = templateForm.value.content.replace(regex, '')
}

function formatDate(dateString: string): string {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped lang="scss">
.template-manager-view {
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

.templates-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.template-card {
  transition: transform 0.2s;
  
  &:hover {
    transform: translateY(-4px);
  }
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.template-info {
  flex: 1;
}

.template-name {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: #303133;
}

.template-description {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #606266;
  line-height: 1.5;
  min-height: 42px;
}

.template-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.template-updated {
  font-size: 12px;
  color: #909399;
}

.template-actions {
  display: flex;
  gap: 8px;
}

.template-editor {
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.editor-help {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.no-variables {
  font-size: 12px;
  color: #909399;
  font-style: italic;
}
</style>
