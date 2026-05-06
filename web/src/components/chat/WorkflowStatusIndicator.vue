<template>
    <transition name="status-fade">
        <div v-if="status" class="workflow-status" :class="statusClass">
            <div class="status-content">
                <!-- Status Icon with Pulse Effect -->
                <span class="status-icon-wrapper">
                    <span class="status-icon" :class="{ 'pulse': isActive }">
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
                </span>

                <!-- Status Text with Gradient -->
                <span class="status-text">{{ status }}</span>

                <!-- Active Tools Chips -->
                <div v-if="activeTools.length > 0" class="active-tools">
                    <el-tag 
                        v-for="tool in activeTools" 
                        :key="tool" 
                        size="small" 
                        type="primary" 
                        effect="dark"
                        class="tool-chip"
                    >
                        <el-icon><Tools /></el-icon>
                        {{ tool }}
                    </el-tag>
                </div>
            </div>
            
            <!-- Progress Bar for Active State -->
            <div v-if="isActive" class="progress-bar">
                <div class="progress-fill"></div>
            </div>
        </div>
    </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, CircleCheck, CircleClose, Tools } from '@element-plus/icons-vue'

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

// Computed class based on status
const statusClass = computed(() => {
    if (isActive.value) return 'status-active'
    if (isSuccess.value) return 'status-success'
    if (isError.value) return 'status-error'
    return ''
})
</script>

<style scoped lang="scss">
.workflow-status {
    position: relative;
    padding: 16px 24px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    background: var(--el-bg-color);
    overflow: hidden;
    transition: all 0.3s ease;

    &.status-active {
        background: linear-gradient(135deg, 
            rgba(64, 158, 255, 0.05) 0%, 
            rgba(64, 158, 255, 0.1) 50%,
            rgba(64, 158, 255, 0.05) 100%
        );
        border-left: 4px solid var(--el-color-primary);
    }

    &.status-success {
        background: linear-gradient(135deg, 
            rgba(103, 194, 58, 0.05) 0%, 
            rgba(103, 194, 58, 0.1) 50%,
            rgba(103, 194, 58, 0.05) 100%
        );
        border-left: 4px solid var(--el-color-success);
    }

    &.status-error {
        background: linear-gradient(135deg, 
            rgba(245, 108, 108, 0.05) 0%, 
            rgba(245, 108, 108, 0.1) 50%,
            rgba(245, 108, 108, 0.05) 100%
        );
        border-left: 4px solid var(--el-color-danger);
    }
}

.status-content {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 14px;
    color: var(--el-text-color-primary);
    position: relative;
    z-index: 1;
}

.status-icon-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

.status-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--el-bg-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;

    &.pulse {
        animation: pulse 2s ease-in-out infinite;
    }

    .is-loading {
        animation: rotate 1.5s linear infinite;
        color: var(--el-color-primary);
        font-size: 18px;
    }

    .text-success {
        color: var(--el-color-success);
        font-size: 20px;
    }

    .text-error {
        color: var(--el-color-danger);
        font-size: 20px;
    }
}

@keyframes pulse {
    0%, 100% {
        box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
        transform: scale(1);
    }
    50% {
        box-shadow: 0 4px 16px rgba(64, 158, 255, 0.6);
        transform: scale(1.05);
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

.status-text {
    flex: 1;
    font-weight: 500;
    letter-spacing: 0.3px;
    background: linear-gradient(90deg, 
        var(--el-text-color-primary) 0%, 
        var(--el-text-color-regular) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.active-tools {
    display: flex;
    gap: 8px;
    margin-left: auto;
    flex-wrap: wrap;
}

.tool-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 12px;
    border-radius: 12px;
    transition: all 0.2s ease;

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
    }

    .el-icon {
        font-size: 12px;
    }
}

.progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--el-fill-color-lighter);
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, 
        var(--el-color-primary) 0%, 
        var(--el-color-primary-light-3) 50%,
        var(--el-color-primary) 100%
    );
    background-size: 200% 100%;
    animation: progress-flow 2s linear infinite;
    border-radius: 3px;
}

@keyframes progress-flow {
    0% {
        background-position: 200% 0;
        width: 30%;
    }
    50% {
        width: 70%;
    }
    100% {
        background-position: -200% 0;
        width: 30%;
    }
}

/* Transition animations */
.status-fade-enter-active,
.status-fade-leave-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.status-fade-enter-from,
.status-fade-leave-to {
    opacity: 0;
    transform: translateY(-10px) scale(0.98);
}
</style>
