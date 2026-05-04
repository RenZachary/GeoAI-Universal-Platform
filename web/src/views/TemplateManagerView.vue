<template>
  <div class="template-manager-view">
    <div class="view-header">
      <h2>{{ $t('templates.title') }}</h2>
      <el-button type="primary" @click="handleCreateTemplate">
        <el-icon><Plus /></el-icon>
        {{ $t('templates.newTemplate') }}
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
              @click="() => handleEditTemplate(template)"
            >
              {{ $t('common.edit') }}
            </el-button>
            <el-popconfirm
              :title="$t('templates.deleteConfirm', { name: template.name })"
              @confirm="handleDeleteTemplate(template.id)"
            >
              <template #reference>
                <el-button size="small" type="danger" text>
                  {{ $t('common.delete') }}
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
        
        <p class="template-description">{{ template.description }}</p>
        
        <div class="template-meta">
          <span class="template-updated">
            {{ $t('data.uploadedAt') }}: {{ formatDate(template.updatedAt) }}
          </span>
        </div>
      </el-card>
      
      <el-empty 
        v-if="!templateStore.isLoading && templateStore.templates.length === 0"
        :description="$t('templates.noTemplates')"
        :image-size="120"
      >
        <el-button type="primary" @click="handleCreateTemplate">
          {{ $t('templates.createTemplate') }}
        </el-button>
      </el-empty>
    </div>
    
    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="showEditorDialog"
      :title="editingTemplate ? $t('templates.edit') : $t('templates.newTemplate')"
      width="900px"
      :close-on-click-modal="false"
    >
      <el-form :model="templateForm" label-width="100px">
        <el-form-item :label="$t('templates.name')" required>
          <el-input v-model="templateForm.name" :placeholder="$t('templates.name')" />
        </el-form-item>
        
        <el-form-item :label="$t('templates.language')">
          <el-select v-model="templateForm.language" :placeholder="$t('templates.selectLanguage')" style="width: 100%" :disabled="!!editingTemplate">
            <el-option :label="$t('templates.englishUS')" value="en-US" />
            <el-option :label="$t('templates.chineseSimplified')" value="zh-CN" />
          </el-select>
        </el-form-item>
        
        <el-form-item :label="$t('templates.description')">
          <el-input 
            v-model="templateForm.description" 
            type="textarea"
            :rows="2"
            :placeholder="$t('templates.briefDescription')"
          />
        </el-form-item>
        
        <el-form-item :label="$t('templates.content')" required>
          <el-input 
            v-model="templateForm.content" 
            type="textarea"
            :rows="15"
            :placeholder="$t('templates.enterContent')"
            class="template-editor"
          />
          <div class="editor-help">
            {{ $t('templates.variableSyntax') }}
          </div>
        </el-form-item>
        
        <el-form-item :label="$t('templates.variables')">
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
            {{ $t('templates.noVariablesDetected') }}
          </span>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showEditorDialog = false">{{ $t('templates.cancel') }}</el-button>
        <el-button type="primary" @click="handleSaveTemplate">
          {{ $t('templates.saveTemplate') }}
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
import { useI18n } from 'vue-i18n'

const templateStore = useTemplateStore()
const { t } = useI18n()

const showEditorDialog = ref(false)
const editingTemplate = ref<PromptTemplate | null>(null)
const templateForm = ref({
  name: '',
  language: 'en-US',
  description: '',
  content: ''
})

// Lifecycle
import { onMounted } from 'vue'
onMounted(() => {
  templateStore.loadTemplates()
})

// Computed - Extract variables from template content
const extractedVariables = computed(() => {
  const content = templateForm.value.content || ''
  const matches = content.match(/\{\{(\w+)\}\}/g)
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
    language: 'en-US',
    description: '',
    content: ''
  }
  showEditorDialog.value = true
}

async function handleEditTemplate(template: PromptTemplate) {
  editingTemplate.value = template
  try {
    // Fetch full template with content
    const fullTemplate = await templateStore.getTemplate(template.id)
    templateForm.value = {
      name: fullTemplate.name,
      language: fullTemplate.language,
      description: fullTemplate.description || '',
      content: fullTemplate.content || ''
    }
    showEditorDialog.value = true
  } catch (error: any) {
    ElMessage.error(error.message || t('templates.operationFailed'))
  }
}

async function handleSaveTemplate() {
  // Validation
  if (!templateForm.value.name.trim()) {
    ElMessage.error(t('templates.templateNameRequired'))
    return
  }
  
  if (!templateForm.value.content.trim()) {
    ElMessage.error(t('templates.templateContentRequired'))
    return
  }
  
  try {
    if (editingTemplate.value) {
      // Update existing
      await templateStore.updateTemplate(editingTemplate.value.id, {
        content: templateForm.value.content,
        description: templateForm.value.description
      })
      ElMessage.success(t('templates.updateSuccess'))
    } else {
      // Create new
      await templateStore.createTemplate({
        name: templateForm.value.name,
        language: templateForm.value.language,
        description: templateForm.value.description,
        content: templateForm.value.content,
        version: '1.0.0'
      })
      ElMessage.success(t('templates.createSuccess'))
    }
    
    showEditorDialog.value = false
  } catch (error: any) {
    ElMessage.error(error.message || t('templates.operationFailed'))
  }
}

async function handleDeleteTemplate(id: string) {
  try {
    await templateStore.deleteTemplate(id)
    ElMessage.success(t('templates.deleteSuccess'))
  } catch (error: any) {
    ElMessage.error(error.message || t('templates.deleteFailed'))
  }
}

function removeVariable(varName: string) {
  // Remove all occurrences of this variable from content
  const content = templateForm.value.content || ''
  const regex = new RegExp(`\\{\\{${varName}\\}\\}`, 'g')
  templateForm.value.content = content.replace(regex, '')
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
