<template>
  <transition name="status-fade">
    <div v-if="status" class="workflow-status">
      <div class="status-content">
        <!-- Status Icon -->
        <span class="status-icon">
          <el-icon v-if="isActive" class="is-loading">
            <Loading />
          </el-icon>
          <el-icon v-else-if="isSuccess" class="text-success">
            <CircleCheck />
          </el-icon>
          <el-icon v-else-if="isError" class="text-error">
            <CircleClose />
          </el-icon>
        </span>

        <!-- Status Text -->
        <span class="status-text">{{ status }}</span>

        <!-- Active Tools Chips -->
        <div v-if="activeTools.length > 0" class="active-tools">
          <el-tag 
            v-for="tool in activeTools" 
            :key="tool"
            size="small"
            type="info"
            effect="plain"
          >
            {{ tool }}
          </el-tag>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, CircleCheck, CircleClose } from '@element-plus/icons-vue'

interface Props {
  status: string
  activeTools: string[]
}

const props = defineProps<Props>()

// Computed properties for icon state
const isActive = computed(() => {
  // Active if status doesn't contain success/failure indicators
  return props.status && 
    !props.status.includes('✓') && 
    !props.status.includes('✗') &&
    !props.status.includes('✅') &&
    !props.status.includes('❌') &&
    !props.status.includes('completed') &&
    !props.status.includes('failed') &&
    !props.status.includes('ready')
})

const isSuccess = computed(() => {
  return props.status.includes('✓') || 
         props.status.includes('✅') ||
         props.status.includes('completed') ||
         props.status.includes('ready')
})

const isError = computed(() => {
  return props.status.includes('✗') || 
         props.status.includes('❌') ||
         props.status.includes('failed')
})
</script>

<style scoped lang="scss">
.workflow-status {
  padding: 12px 24px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.status-content {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.status-icon {
  display: flex;
  align-items: center;
  
  .is-loading {
    animation: rotate 1.5s linear infinite;
    color: var(--el-color-primary);
  }
  
  .text-success {
    color: var(--el-color-success);
  }
  
  .text-error {
    color: var(--el-color-danger);
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.active-tools {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* Transition animations */
.status-fade-enter-active,
.status-fade-leave-active {
  transition: all 0.3s ease;
}

.status-fade-enter-from,
.status-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
