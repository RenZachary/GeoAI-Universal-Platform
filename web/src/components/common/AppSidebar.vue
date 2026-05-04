<template>
  <div class="app-sidebar">
    <!-- Collapse Toggle -->
    <el-button
      text
      class="collapse-btn"
      @click="uiStore.toggleSidebar"
    >
      <el-icon>
        <Fold v-if="!uiStore.sidebarCollapsed" />
        <Expand v-else />
      </el-icon>
    </el-button>
    
    <!-- Navigation Menu -->
    <el-menu
      :default-active="activeMenu"
      :collapse="uiStore.sidebarCollapsed"
      router
    >
      <el-menu-item index="/">
        <el-icon><ChatDotRound /></el-icon>
        <template #title>{{ $t('chat.conversations') }}</template>
      </el-menu-item>
      
      <el-menu-item index="/map">
        <el-icon><MapLocation /></el-icon>
        <template #title>{{ $t('map.title') || 'Map' }}</template>
      </el-menu-item>
      
      <el-menu-item index="/data">
        <el-icon><Folder /></el-icon>
        <template #title>{{ $t('data.title') }}</template>
      </el-menu-item>
      
      <el-menu-item index="/tools">
        <el-icon><Tools /></el-icon>
        <template #title>{{ $t('tools.availableTools') }}</template>
      </el-menu-item>
      
      <el-menu-item index="/templates">
        <el-icon><Document /></el-icon>
        <template #title>{{ $t('templates.title') }}</template>
      </el-menu-item>
      
      <el-menu-item index="/plugins">
        <el-icon><Connection /></el-icon>
        <template #title>{{ $t('plugins.title') }}</template>
      </el-menu-item>
    </el-menu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUIStore } from '@/stores/ui'
import { ChatDotRound, MapLocation, Folder, Tools, Document, Connection, Setting } from '@element-plus/icons-vue'

const route = useRoute()
const uiStore = useUIStore()

const activeMenu = computed(() => route.path)
</script>

<style scoped lang="scss">
.app-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  
  .collapse-btn {
    width: 100%;
    height: 40px;
    border-radius: 0;
    border-bottom: 1px solid var(--el-border-color);
  }
}

.el-menu {
  flex: 1;
  border-right: none;
}
</style>
