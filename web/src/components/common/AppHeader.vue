<template>
  <div class="app-header">
    <div class="header-left">
      <el-icon class="logo-icon"><Location /></el-icon>
      <span class="app-title">GeoAI-UP</span>
    </div>
    
    <div class="header-right">
      <!-- Language Selector -->
      <el-dropdown @command="handleLanguageChange">
        <el-button text>
          <span class="lang-text">{{ configStore.language === 'zh-CN' ? '中文' : 'EN' }}</span>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="en-US">English</el-dropdown-item>
            <el-dropdown-item command="zh-CN">中文</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      
      <!-- Theme Toggle -->
      <el-button text @click="toggleTheme">
        <el-icon v-if="uiStore.theme === 'dark'"><Moon /></el-icon>
        <el-icon v-else><Sunny /></el-icon>
      </el-button>
      
      <!-- Settings -->
      <el-button text @click="$router.push('/settings')">
        <el-icon><Setting /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfigStore } from '@/stores/config'
import { useUIStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import { Moon, Sunny, Setting, Location } from '@element-plus/icons-vue'

const configStore = useConfigStore()
const uiStore = useUIStore()
const { locale } = useI18n()

function handleLanguageChange(lang: string) {
  configStore.setLanguage(lang as any)
  locale.value = lang
}

function toggleTheme() {
  const newTheme = uiStore.theme === 'dark' ? 'light' : 'dark'
  uiStore.setTheme(newTheme)
}
</script>

<style scoped lang="scss">
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 20px;
  background: var(--el-bg-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  
  .logo-icon {
    font-size: 24px;
    color: var(--el-color-primary);
  }
  
  .app-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  
  .lang-text {
    font-size: 14px;
    font-weight: 500;
  }
}
</style>
