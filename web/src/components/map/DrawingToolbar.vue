<template>
  <div class="drawing-toolbar">
    <el-tooltip content="Draw Polygon" placement="left">
      <el-button
        :type="drawingMode === 'polygon' ? 'primary' : 'default'"
        size="small"
        circle
        @click="startDrawing('polygon')"
      >
        <svg viewBox="0 0 1024 1024" width="16" height="16">
          <path fill="currentColor" d="M896 192H128v640h768V192zm-64 576H192V256h640v512z"/>
          <path fill="currentColor" d="M320 384l128 256 128-128 128 192V384z"/>
        </svg>
      </el-button>
    </el-tooltip>

    <el-tooltip content="Draw Circle" placement="left">
      <el-button
        :type="drawingMode === 'circle' ? 'primary' : 'default'"
        size="small"
        circle
        @click="startDrawing('circle')"
      >
        <el-icon><CircleCloseFilled /></el-icon>
      </el-button>
    </el-tooltip>

    <el-tooltip content="Draw Line" placement="left">
      <el-button
        :type="drawingMode === 'line' ? 'primary' : 'default'"
        size="small"
        circle
        @click="startDrawing('line')"
      >
        <el-icon><Connection /></el-icon>
      </el-button>
    </el-tooltip>

    <el-tooltip content="Draw Rectangle" placement="left">
      <el-button
        :type="drawingMode === 'rectangle' ? 'primary' : 'default'"
        size="small"
        circle
        @click="startDrawing('rectangle')"
      >
        <svg viewBox="0 0 1024 1024" width="16" height="16">
          <path fill="currentColor" d="M128 192h768v640H128V192zm64 64v512h640V256H192z"/>
        </svg>
      </el-button>
    </el-tooltip>

    <el-divider direction="vertical" />

    <el-tooltip content="Clear All Drawings" placement="left">
      <el-button
        type="danger"
        size="small"
        circle
        :disabled="drawnGeometries.length === 0"
        @click="clearAllDrawings"
      >
        <el-icon><Delete /></el-icon>
      </el-button>
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMapStore } from '@/stores/map'
import { CircleCloseFilled, Connection, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { DrawnGeometry } from '@/stores/mapImpl/state'
import { drawingManager, type DrawingResult } from '@/services/drawing'
import { addPermanentDrawingLayer } from '@/services/drawing'
import { generateDrawingId } from '@/services/drawing'

const mapStore = useMapStore()
const drawingMode = computed(() => drawingManager.getMode())
const drawnGeometries = computed(() => mapStore.drawnGeometries || [])

// Initialize drawing manager callback
drawingManager.setOnDrawingComplete((result: DrawingResult) => {
  handleDrawingComplete(result)
})

/**
 * Start drawing mode
 */
function startDrawing(mode: 'polygon' | 'circle' | 'line' | 'rectangle') {
  const map = mapStore.mapInstance
  if (!map) {
    ElMessage.warning('Map not initialized')
    return
  }

  drawingManager.startDrawing(mode, map)
  
  if (drawingManager.isDrawing()) {
    ElMessage.info(`Click on the map to start drawing ${mode}`)
  } else {
    ElMessage.info('Drawing cancelled')
  }
}

/**
 * Handle drawing completion
 */
function handleDrawingComplete(result: DrawingResult) {
  const id = generateDrawingId()
  
  // Rectangle is a special case of polygon, store it as 'polygon' type
  const storedType = result.type === 'rectangle' ? 'polygon' : result.type
  
  const drawnGeometry: DrawnGeometry = {
    id,
    type: storedType,
    geometry: result.geometry,
    properties: {
      ...result.properties,
      originalType: result.type // Keep original type for reference
    },
    createdAt: new Date()
  }
  
  // Add to store
  if (!mapStore.drawnGeometries) {
    console.error('drawnGeometries array not initialized')
    return
  }
  
  mapStore.drawnGeometries.push(drawnGeometry)
  
  console.log('[DrawingToolbar] Added drawn geometry to mapStore:', drawnGeometry)
  console.log('[DrawingToolbar] mapStore.drawnGeometries length:', mapStore.drawnGeometries.length)

  // Add permanent layer to display the drawing (use 'polygon' for rectangle)
  const map = mapStore.mapInstance
  if (map) {
    addPermanentDrawingLayer(map, id, result.geometry, storedType)
  }

  // Display success message with proper name
  const displayName = result.type === 'rectangle' ? 'Rectangle' : 
                     result.type.charAt(0).toUpperCase() + result.type.slice(1)
  ElMessage.success(`${displayName} drawn successfully`)
}

/**
 * Clear all drawings
 */
function clearAllDrawings() {
  const map = mapStore.mapInstance
  if (!map) return

  // Import here to avoid circular dependency
  import('@/services/drawing').then(({ clearAllDrawingLayers }) => {
    clearAllDrawingLayers(map, mapStore.drawnGeometries || [])
    
    // Clear from store
    if (mapStore.drawnGeometries) {
      mapStore.drawnGeometries.splice(0, mapStore.drawnGeometries.length)
    }
    
    ElMessage.success('All drawings cleared')
  })
}
</script>

<style scoped lang="scss">
.drawing-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);

  .el-divider--vertical {
    margin: 0;
    height: 1px;
  }
}
</style>
