<template>
  <aside class="conversation-sidebar" :class="{ collapsed: collapsed }">
    <div class="sidebar-header">
      <el-tooltip :content="$t('chat.newChat')" placement="right">
        <el-button class="new-chat-btn" text @click="$emit('new-chat')">
          <el-icon>
            <Plus />
          </el-icon>
        </el-button>
      </el-tooltip>
    </div>

    <div v-if="!collapsed" class="conversation-list">
      <div v-for="conv in conversations" :key="conv.id" class="conversation-item"
        :class="{ active: conv.id === currentConversationId }" @click="$emit('select-conversation', conv.id)">
        <div class="info">
          <span class="conversation-title">{{ conv.title || 'Untitled' }}</span>
          <span> 
            <el-tag type="info" effect="plain" size="small">{{ new Date(conv.createdAt || '').toLocaleString()
              }}</el-tag>
          </span>
        </div>
        <div class="conversation-actions">
          <el-icon class="rename-icon" @click.stop="$emit('rename-conversation', conv.id, conv.title || '')">
            <Edit />
          </el-icon>
          <el-icon class="delete-icon" @click.stop="$emit('delete-conversation', conv.id)">
            <Delete />
          </el-icon>
        </div>
      </div>

      <el-empty v-if="conversations.length === 0" :description="$t('chat.noMessages')" :image-size="80" />
    </div>

    <div class="sidebar-footer">
      <el-tooltip :content="collapsed ? $t('chat.expandSidebar') : $t('chat.collapseSidebar')" placement="right">
        <el-button class="sidebar-toggle-btn" text @click="$emit('toggle-collapse')">
          <el-icon v-if="collapsed">
            <DArrowRight />
          </el-icon>
          <el-icon v-else>
            <DArrowLeft />
          </el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Plus, Delete, DArrowRight, DArrowLeft, Edit } from '@element-plus/icons-vue'

interface Conversation {
  id: string
  title?: string
  createdAt?: string
  updatedAt?: string
}

interface Props {
  conversations: Conversation[]
  currentConversationId: string | null
  collapsed: boolean
}

defineProps<Props>()

defineEmits<{
  'new-chat': []
  'select-conversation': [id: string]
  'rename-conversation': [id: string, title: string]
  'delete-conversation': [id: string]
  'toggle-collapse': []
}>()
</script>

<style scoped lang="scss">
.conversation-sidebar {
  width: 280px;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;

  &.collapsed {
    width: 60px;
  }
}

.sidebar-header {
  padding: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.new-chat-btn {
  width: 100%;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.conversation-item {
  padding: 8px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.active {
    background: var(--el-color-primary-light-9);
    border-left: 3px solid var(--el-color-primary);
  }

  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .conversation-title {
    font-size: 14px;
    color: var(--el-text-color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .conversation-actions {
    display: flex;
    gap: 8px;
    opacity: 0;
    transition: opacity 0.2s ease;

    .el-icon {
      cursor: pointer;
      color: var(--el-text-color-secondary);
      font-size: 16px;

      &:hover {
        color: var(--el-color-primary);
      }
    }
  }

  &:hover .conversation-actions {
    opacity: 1;
  }
}

.sidebar-footer {
  padding: 4px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.sidebar-toggle-btn {
  width: 100%;
}
</style>
