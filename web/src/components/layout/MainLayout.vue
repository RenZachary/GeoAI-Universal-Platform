<template>
  <el-container class="main-layout">
    <!-- Sidebar -->
    <el-aside :width="uiStore.sidebarCollapsed ? '64px' : '160px'" class="sidebar">
      <AppSidebar />
    </el-aside>
    
    <!-- Main Content -->
    <el-container>
      <!-- Header -->
      <el-header class="header">
        <AppHeader />
      </el-header>
      
      <!-- Content -->
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { useUIStore } from '@/stores/ui'
import AppHeader from '@/components/common/AppHeader.vue'
import AppSidebar from '@/components/common/AppSidebar.vue'

const uiStore = useUIStore()
</script>

<style scoped lang="scss">
.main-layout {
  height: 100vh;
}

.sidebar {
  background: var(--el-bg-color-page);
  border-right: 1px solid var(--el-border-color);
  transition: width 0.3s;
  overflow: hidden;
}

.header {
  padding: 0;
  border-bottom: 1px solid var(--el-border-color);
  height: 60px;
}

.main-content {
  padding: 0;
  overflow: hidden;
  background: var(--el-bg-color);
}
</style>
