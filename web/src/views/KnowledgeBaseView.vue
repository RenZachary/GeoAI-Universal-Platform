<template>
  <div class="knowledge-base-view">
    <div class="view-header">
      <h2>{{ $t('kb.title') }}</h2>
      <div class="header-actions">
        <el-upload
          :show-file-list="false"
          :before-upload="handleBeforeUpload"
          :http-request="handleUpload"
          accept=".pdf,.docx,.md,.markdown"
        >
          <el-button type="primary" :loading="kbStore.isUploading">
            <el-icon><Upload /></el-icon>
            {{ $t('kb.uploadDocument') }}
          </el-button>
        </el-upload>
      </div>
    </div>

    <!-- Statistics Cards -->
    <el-row :gutter="16" class="stats-cards">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon total">
              <el-icon :size="32"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ kbStore.statistics?.totalDocuments || 0 }}</div>
              <div class="stat-label">{{ $t('kb.totalDocuments') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon ready">
              <el-icon :size="32"><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ kbStore.readyDocumentsCount }}</div>
              <div class="stat-label">{{ $t('kb.ready') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon processing">
              <el-icon :size="32"><Loading /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ kbStore.processingDocumentsCount }}</div>
              <div class="stat-label">{{ $t('kb.processing') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon error">
              <el-icon :size="32"><CircleClose /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ kbStore.errorDocumentsCount }}</div>
              <div class="stat-label">{{ $t('kb.error') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Filters and Search -->
    <div class="filters-bar">
      <el-select
        v-model="filterType"
        :placeholder="$t('kb.filterByType')"
        clearable
        style="width: 150px"
        @change="applyFilters"
      >
        <el-option label="PDF" value="pdf" />
        <el-option label="Word" value="word" />
        <el-option label="Markdown" value="markdown" />
      </el-select>

      <el-select
        v-model="filterStatus"
        :placeholder="$t('kb.filterByStatus')"
        clearable
        style="width: 150px"
        @change="applyFilters"
      >
        <el-option :label="$t('kb.ready')" value="ready" />
        <el-option :label="$t('kb.processing')" value="processing" />
        <el-option :label="$t('kb.error')" value="error" />
      </el-select>

      <el-button @click="clearFilters">
        <el-icon><Refresh /></el-icon>
        {{ $t('kb.clearFilters') }}
      </el-button>

      <div class="spacer"></div>

      <!-- Quick Search -->
      <el-input
        v-model="searchQuery"
        :placeholder="$t('kb.quickSearch')"
        clearable
        style="width: 300px"
        @keyup.enter="handleQuickSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
        <template #append>
          <el-button @click="handleQuickSearch">
            {{ $t('kb.search') }}
          </el-button>
        </template>
      </el-input>
    </div>

    <!-- Documents Table -->
    <el-table
      :data="kbStore.documents"
      v-loading="kbStore.isLoading"
      stripe
      style="width: 100%"
    >
      <el-table-column prop="name" :label="$t('kb.documentName')">
        <template #default="{ row }">
          <div class="document-name">
            <el-icon><Document /></el-icon>
            <span>{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="type" :label="$t('kb.type')">
        <template #default="{ row }">
          <el-tag size="small" :type="getTypeColor(row.type)">
            {{ row.type.toUpperCase() }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="status" :label="$t('kb.status')" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="getStatusColor(row.status)">
            {{ $t(`kb.${row.status}`) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="chunkCount" :label="$t('kb.chunks')" width="100" align="right">
        <template #default="{ row }">
          {{ row.chunkCount || 'N/A' }}
        </template>
      </el-table-column>

      <el-table-column prop="fileSize" :label="$t('kb.size')" width="100">
        <template #default="{ row }">
          {{ formatFileSize(row.fileSize) }}
        </template>
      </el-table-column>

      <el-table-column prop="createdAt" :label="$t('kb.uploadedAt')" width="180">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>

      <el-table-column :label="$t('common.actions')" fixed="right">
        <template #default="{ row }">
          <div class="action-buttons">
            <el-button
              size="small"
              type="primary"
              text
              @click="handleViewDetail(row)"
            >
              <el-icon><View /></el-icon>
              {{ $t('kb.viewDetails') }}
            </el-button>

            <el-popconfirm
              :title="$t('kb.deleteConfirm', { name: row.name })"
              @confirm="handleDelete(row.id)"
            >
              <template #reference>
                <el-button size="small" type="danger" text>
                  <el-icon><Delete /></el-icon>
                  {{ $t('common.delete') }}
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- Pagination -->
    <div class="pagination-container">
      <el-pagination
        v-model:current-page="kbStore.currentPage"
        v-model:page-size="kbStore.pageSize"
        :total="kbStore.totalDocuments"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="handlePageChange"
        @size-change="handlePageSizeChange"
      />
    </div>

    <!-- Search Results Dialog -->
    <el-dialog
      v-model="showSearchDialog"
      :title="$t('kb.searchResults')"
      width="90%"
      top="5vh"
    >
      <div v-if="kbStore.searchResults" class="search-results">
        <div class="search-summary">
          <span>{{ $t('kb.foundResults', { count: kbStore.searchResults.documents.length }) }}</span>
          <span class="search-time">{{ $t('common.timeElapsed', { time: kbStore.searchResults.searchTime.toFixed(2) }) }}s</span>
        </div>

        <div v-if="kbStore.searchResults.documents.length === 0" class="no-results">
          <el-empty :description="$t('kb.noResults')" />
        </div>

        <div v-else class="results-list">
          <el-card
            v-for="(result, index) in kbStore.searchResults.documents"
            :key="index"
            class="result-card"
            shadow="hover"
          >
            <div class="result-header">
              <el-tag type="primary" size="small">
                {{ result.metadata.documentName }}
              </el-tag>
              <el-tag v-if="result.score" type="success" size="small">
                {{ $t('kb.similarity') }}: {{ (result.score * 100).toFixed(1) }}%
              </el-tag>
            </div>
            <div class="result-content">
              {{ result.content }}
            </div>
          </el-card>
        </div>
      </div>
    </el-dialog>

    <!-- Document Detail Dialog -->
    <el-dialog
      v-model="showDetailDialog"
      :title="$t('kb.documentDetails')"
      width="700px"
    >
      <div v-if="kbStore.currentDocument" class="document-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item :label="$t('kb.documentName')">
            {{ kbStore.currentDocument.name }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('kb.type')">
            <el-tag size="small">{{ kbStore.currentDocument.type.toUpperCase() }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('kb.status')">
            <el-tag size="small" :type="getStatusColor(kbStore.currentDocument.status)">
              {{ $t(`kb.${kbStore.currentDocument.status}`) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('kb.chunks')">
            {{ kbStore.currentDocument?.chunkCount ?? 'N/A' }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('kb.size')">
            {{ formatFileSize(kbStore.currentDocument?.fileSize || 0) }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('kb.uploadedAt')">
            {{ formatDate(kbStore.currentDocument.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item :label="$t('kb.updatedAt')" :span="2">
            {{ formatDate(kbStore.currentDocument.updatedAt) }}
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="kbStore.currentDocument.metadata" class="metadata-section">
          <h4>{{ $t('kb.metadata') }}</h4>
          <pre class="metadata-json">{{ JSON.stringify(kbStore.currentDocument.metadata, null, 2) }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  Upload,
  Document,
  CircleCheck,
  Loading,
  CircleClose,
  Refresh,
  Search,
  View,
  Delete
} from '@element-plus/icons-vue'
import { useKnowledgeBaseStore } from '@/stores/knowledgeBase'
import { formatFileSize, formatDate } from '@/utils/formatters'

const { t } = useI18n()
const kbStore = useKnowledgeBaseStore()

// Local state
const filterType = ref('')
const filterStatus = ref('')
const searchQuery = ref('')
const showDetailDialog = ref(false)
const showSearchDialog = ref(false)

// Lifecycle
onMounted(() => {
  loadInitialData()
})

// Methods
async function loadInitialData() {
  try {
    await Promise.all([
      kbStore.loadStatistics(),
      kbStore.loadDocuments()
    ])
  } catch (error) {
    console.error('Failed to load initial data:', error)
    ElMessage.error(t('kb.messages.loadFailed'))
  }
}

async function handleBeforeUpload(file: File) {
  const isValidType = ['.pdf', '.docx', '.md', '.markdown'].some(ext =>
    file.name.toLowerCase().endsWith(ext)
  )
  
  if (!isValidType) {
    ElMessage.error(t('kb.messages.invalidFileType'))
    return false
  }

  const maxSize = 50 * 1024 * 1024 // 50MB
  if (file.size > maxSize) {
    ElMessage.error(t('kb.messages.fileTooLarge'))
    return false
  }

  return true
}

async function handleUpload(options: any) {
  try {
    await kbStore.uploadDocument(options.file)
    ElMessage.success(t('kb.messages.uploadSuccess'))
  } catch (error: any) {
    ElMessage.error(error.message || t('kb.messages.uploadFailed'))
  }
}

function applyFilters() {
  kbStore.setFilters(filterType.value, filterStatus.value)
  kbStore.loadDocuments()
}

function clearFilters() {
  filterType.value = ''
  filterStatus.value = ''
  kbStore.clearFilters()
  kbStore.loadDocuments()
}

async function handleQuickSearch() {
  if (!searchQuery.value.trim()) {
    return
  }

  try {
    await kbStore.search(searchQuery.value)
    showSearchDialog.value = true
  } catch (error: any) {
    ElMessage.error(error.message || t('kb.messages.searchFailed'))
  }
}

async function handlePageChange(page: number) {
  await kbStore.loadDocuments(page)
}

async function handlePageSizeChange(size: number) {
  kbStore.pageSize = size
  await kbStore.loadDocuments(1)
}

async function handleViewDetail(doc: any) {
  try {
    await kbStore.loadDocumentDetail(doc.id)
    showDetailDialog.value = true
  } catch (error: any) {
    ElMessage.error(error.message || t('kb.messages.loadDetailFailed'))
  }
}

async function handleDelete(id: string) {
  try {
    await kbStore.deleteDocument(id)
    ElMessage.success(t('kb.messages.deleteSuccess'))
  } catch (error: any) {
    ElMessage.error(error.message || t('kb.messages.deleteFailed'))
  }
}

// Utility functions
function getTypeColor(type: string): 'success' | 'warning' | 'info' | 'danger' | 'primary' {
  const colors: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
    pdf: 'danger',
    word: 'primary',
    markdown: 'success'
  }
  return colors[type] || 'info'
}

function getStatusColor(status: string): 'success' | 'warning' | 'danger' | 'info' {
  const colors: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    ready: 'success',
    processing: 'warning',
    error: 'danger'
  }
  return colors[status] || 'info'
}
</script>

<style scoped lang="scss">
@use '@/assets/kbView.scss';
</style>
