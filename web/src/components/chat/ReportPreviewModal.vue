<template>
  <el-dialog
    v-model="visible"
    :title="reportTitle"
    width="80%"
    top="5vh"
    destroy-on-close
    class="report-preview-dialog"
  >
    <div class="report-container">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <el-icon class="is-loading"><Loading /></el-icon>
        <p>{{ t('report.loadingReport') }}</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <el-icon color="#f56c6c"><CircleClose /></el-icon>
        <p>{{ error }}</p>
        <el-button type="primary" @click="retryLoad">{{ t('report.retry') }}</el-button>
      </div>

      <!-- Report Content -->
      <div v-else class="markdown-content" v-html="renderedContent"></div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">{{ t('report.close') }}</el-button>
        <el-button type="primary" @click="handleDownload">
          <el-icon><Download /></el-icon>
          {{ t('report.download') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading, CircleClose, Download } from '@element-plus/icons-vue'
import { marked } from 'marked'

const { t } = useI18n()

interface Props {
  modelValue: boolean
  reportUrl: string
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  reportUrl: '',
  title: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

// State
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const loading = ref(false)
const error = ref<string | null>(null)
const rawContent = ref('')

// Computed
const reportTitle = computed(() => props.title || t('report.preview'))

const renderedContent = computed(() => {
  if (!rawContent.value) return ''
  // Configure marked for safe rendering
  return marked(rawContent.value, {
    breaks: true,
    gfm: true
  })
})

// Methods
async function loadReport() {
  if (!props.reportUrl) {
    error.value = t('report.noReportUrl')
    return
  }

  loading.value = true
  error.value = null
  rawContent.value = ''

  try {
    const response = await fetch(props.reportUrl)
    
    if (!response.ok) {
      throw new Error(`${t('report.failedToLoad')}: ${response.status} ${response.statusText}`)
    }

    rawContent.value = await response.text()
  } catch (err) {
    console.error('[ReportPreviewModal] Failed to load report:', err)
    error.value = err instanceof Error ? err.message : t('report.failedToLoad')
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

function retryLoad() {
  loadReport()
}

function handleClose() {
  visible.value = false
}

function handleDownload() {
  if (!rawContent.value) {
    ElMessage.warning(t('report.noContentToDownload'))
    return
  }

  // Create blob and trigger download
  const blob = new Blob([rawContent.value], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${props.title || t('report.preview')}.md`
  link.click()
  URL.revokeObjectURL(url)
  
  ElMessage.success(t('report.downloaded'))
}

// Watch for dialog open
watch(visible, (newValue) => {
  if (newValue && props.reportUrl) {
    loadReport()
  }
})

// Watch for URL change while dialog is open
watch(() => props.reportUrl, (newUrl) => {
  if (visible.value && newUrl) {
    loadReport()
  }
})
</script>

<style scoped lang="scss">
.report-preview-dialog {
  :deep(.el-dialog__body) {
    padding: 0;
    max-height: 70vh;
    overflow: hidden;
  }
}

.report-container {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 16px;
  color: #909399;

  .el-icon {
    font-size: 48px;
  }

  p {
    margin: 0;
    font-size: 16px;
  }
}

.error-state {
  color: #f56c6c;
}

.markdown-content {
  line-height: 1.8;
  color: #303133;

  :deep(h1) {
    font-size: 2em;
    margin: 0.67em 0;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #eaecef;
  }

  :deep(h2) {
    font-size: 1.5em;
    margin: 0.83em 0;
    padding-bottom: 0.3em;
    border-bottom: 1px solid #eaecef;
  }

  :deep(h3) {
    font-size: 1.25em;
    margin: 1em 0;
  }

  :deep(h4) {
    font-size: 1em;
    margin: 1.33em 0;
  }

  :deep(p) {
    margin: 1em 0;
  }

  :deep(ul),
  :deep(ol) {
    margin: 1em 0;
    padding-left: 2em;
  }

  :deep(li) {
    margin: 0.5em 0;
  }

  :deep(code) {
    padding: 0.2em 0.4em;
    margin: 0;
    font-size: 85%;
    background-color: rgba(27, 31, 35, 0.05);
    border-radius: 3px;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  }

  :deep(pre) {
    padding: 16px;
    overflow: auto;
    font-size: 85%;
    line-height: 1.45;
    background-color: #f6f8fa;
    border-radius: 6px;
    margin: 1em 0;

    code {
      padding: 0;
      margin: 0;
      font-size: 100%;
      background-color: transparent;
    }
  }

  :deep(blockquote) {
    padding: 0 1em;
    color: #6a737d;
    border-left: 0.25em solid #dfe2e5;
    margin: 1em 0;
  }

  :deep(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;

    th,
    td {
      padding: 6px 13px;
      border: 1px solid #dfe2e5;
    }

    th {
      background-color: #f6f8fa;
      font-weight: 600;
    }

    tr:nth-child(2n) {
      background-color: #f6f8fa;
    }
  }

  :deep(a) {
    color: #409eff;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  :deep(img) {
    max-width: 100%;
    height: auto;
  }

  :deep(hr) {
    height: 0.25em;
    padding: 0;
    margin: 24px 0;
    background-color: #e1e4e8;
    border: 0;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
