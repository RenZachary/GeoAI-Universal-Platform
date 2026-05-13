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
import { ref, computed } from 'vue'
import { useMapStore } from '@/stores/map'
import { CircleCloseFilled, Connection, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { DrawnGeometry } from '@/stores/mapImpl/state'

const mapStore = useMapStore()
const drawingMode = ref<'polygon' | 'circle' | 'line' | null>(null)
const drawnGeometries = computed(() => mapStore.drawnGeometries || [])

// Drawing state
let currentDrawHandler: any = null
let tempLayerId: string | null = null
let tempSourceId: string | null = null

/**
 * Start drawing mode
 */
function startDrawing(mode: 'polygon' | 'circle' | 'line') {
  // If already in this mode, cancel it
  if (drawingMode.value === mode) {
    cancelDrawing()
    return
  }

  // Cancel any existing drawing
  if (drawingMode.value) {
    cancelDrawing()
  }

  drawingMode.value = mode
  initializeDrawingMode(mode)
  
  ElMessage.info(`Click on the map to start drawing ${mode}`)
}

/**
 * Initialize drawing mode with MapLibre handlers
 */
function initializeDrawingMode(mode: 'polygon' | 'circle' | 'line') {
  const map = mapStore.mapInstance
  if (!map) return

  switch (mode) {
    case 'polygon':
      initPolygonDrawing(map)
      break
    case 'circle':
      initCircleDrawing(map)
      break
    case 'line':
      initLineDrawing(map)
      break
  }
}

/**
 * Initialize polygon drawing
 */
function initPolygonDrawing(map: any) {
  console.log('[DrawingToolbar] initPolygonDrawing called')
  
  const coordinates: [number, number][] = []
  let isDrawing = false

  // Create temporary source and layer for visual feedback
  createTempGeoJSONLayer('polygon')

  const onClick = (e: any) => {
    const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat]
    
    if (!isDrawing) {
      // First click - start drawing
      isDrawing = true
      coordinates.push(coord)
      updateTempGeometry({
        type: 'Polygon',
        coordinates: [[...coordinates, coord]] // Close the ring for visual feedback
      })
    } else {
      // Subsequent clicks - add points
      coordinates.push(coord)
      updateTempGeometry({
        type: 'Polygon',
        coordinates: [[...coordinates, coordinates[0]]] // Keep closed
      })
      
      // Check if clicked near first point to close polygon
      if (coordinates.length > 2 && isNearFirstPoint(coord, coordinates[0], map)) {
        finishPolygon(coordinates)
      }
    }
  }

  const onDoubleClick = (e: any) => {
    if (isDrawing && coordinates.length > 2) {
      e.originalEvent.stopPropagation()
      e.originalEvent.preventDefault()
      finishPolygon(coordinates)
    }
  }

  map.on('click', onClick)
  map.on('dblclick', onDoubleClick)

  currentDrawHandler = {
    mode: 'polygon',
    cleanup: () => {
      map.off('click', onClick)
      map.off('dblclick', onDoubleClick)
      removeTempLayer()
    }
  }
}

/**
 * Initialize circle drawing (center + radius)
 */
function initCircleDrawing(map: any) {
  let center: [number, number] | null = null
  let radius: number = 0
  let isDrawing = false

  createTempGeoJSONLayer('circle')

  const onClick = (e: any) => {
    const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat]

    if (!isDrawing) {
      // First click - set center
      isDrawing = true
      center = coord
      ElMessage.info('Drag to set radius, click to confirm')
    } else {
      // Second click - set radius and finish
      if (center) {
        radius = calculateDistance(center, coord)
        finishCircle(center, radius)
      }
    }
  }

  const onMouseMove = (e: any) => {
    if (isDrawing && center) {
      const currentCoord: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      radius = calculateDistance(center, currentCoord)
      
      const circleGeometry = createCircleGeometry(center, radius)
      updateTempGeometry(circleGeometry)
    }
  }

  map.on('click', onClick)
  map.on('mousemove', onMouseMove)

  currentDrawHandler = {
    mode: 'circle',
    cleanup: () => {
      map.off('click', onClick)
      map.off('mousemove', onMouseMove)
      removeTempLayer()
    }
  }
}

/**
 * Initialize line drawing
 */
function initLineDrawing(map: any) {
  const coordinates: [number, number][] = []
  let isDrawing = false

  createTempGeoJSONLayer('line')

  const onClick = (e: any) => {
    const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat]
    
    if (!isDrawing) {
      isDrawing = true
      coordinates.push(coord)
      updateTempGeometry({
        type: 'LineString',
        coordinates: [...coordinates]
      })
    } else {
      coordinates.push(coord)
      updateTempGeometry({
        type: 'LineString',
        coordinates: [...coordinates]
      })
      
      // Check if clicked near first point to close line
      if (coordinates.length > 1 && isNearFirstPoint(coord, coordinates[0], map)) {
        finishLine([...coordinates, coordinates[0]]) // Close the line
      }
    }
  }

  const onDoubleClick = (e: any) => {
    if (isDrawing && coordinates.length > 1) {
      e.originalEvent.stopPropagation()
      e.originalEvent.preventDefault()
      finishLine(coordinates)
    }
  }

  map.on('click', onClick)
  map.on('dblclick', onDoubleClick)

  currentDrawHandler = {
    mode: 'line',
    cleanup: () => {
      map.off('click', onClick)
      map.off('dblclick', onDoubleClick)
      removeTempLayer()
    }
  }
}

/**
 * Create temporary GeoJSON layer for drawing visualization
 */
function createTempGeoJSONLayer(type: string) {
  const map = mapStore.mapInstance
  if (!map) return

  tempSourceId = `draw-temp-${Date.now()}`
  tempLayerId = `draw-layer-${tempSourceId}`

  map.addSource(tempSourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: null,
      properties: {}
    }
  })

  if (type === 'line') {
    // Line layer
    map.addLayer({
      id: tempLayerId,
      type: 'line',
      source: tempSourceId,
      paint: {
        'line-color': '#409eff',
        'line-width': 3,
        'line-opacity': 0.8
      }
    })
  } else {
    // Fill layer for polygon/circle
    map.addLayer({
      id: tempLayerId,
      type: 'fill',
      source: tempSourceId,
      paint: {
        'fill-color': '#409eff',
        'fill-opacity': 0.3
      }
    })
    
    // Add outline layer for polygon/circle
    const outlineLayerId = `${tempLayerId}-outline`
    map.addLayer({
      id: outlineLayerId,
      type: 'line',
      source: tempSourceId,
      paint: {
        'line-color': '#409eff',
        'line-width': 2,
        'line-opacity': 0.8
      }
    })
  }
}

/**
 * Update temporary geometry
 */
function updateTempGeometry(geometry: GeoJSON.Geometry | null) {
  if (!tempSourceId || !mapStore.mapInstance) return

  const source = mapStore.mapInstance.getSource(tempSourceId)
  if (source) {
    source.setData({
      type: 'Feature',
      geometry: geometry,
      properties: {}
    })
  }
}

/**
 * Remove temporary layer
 */
function removeTempLayer() {
  const map = mapStore.mapInstance
  if (!map) return

  if (tempLayerId && map.getLayer(tempLayerId)) {
    map.removeLayer(tempLayerId)
  }
  
  // Remove outline layer if exists
  const outlineLayerId = tempLayerId ? `${tempLayerId}-outline` : null
  if (outlineLayerId && map.getLayer(outlineLayerId)) {
    map.removeLayer(outlineLayerId)
  }

  if (tempSourceId && map.getSource(tempSourceId)) {
    map.removeSource(tempSourceId)
  }

  tempLayerId = null
  tempSourceId = null
}

/**
 * Finish polygon drawing
 */
function finishPolygon(coordinates: [number, number][]) {
  console.log('[DrawingToolbar] finishPolygon called with', coordinates.length, 'coordinates')
  
  // Ensure polygon is closed
  if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
      coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
    coordinates.push(coordinates[0])
  }

  const geometry: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [coordinates]
  }

  console.log('[DrawingToolbar] Calling addDrawnGeometry with polygon')
  addDrawnGeometry(geometry, 'polygon')
  cleanupAfterDrawing()
  ElMessage.success('Polygon drawn successfully')
}

/**
 * Finish circle drawing
 */
function finishCircle(center: [number, number], radius: number) {
  const geometry = createCircleGeometry(center, radius)
  addDrawnGeometry(geometry, 'circle')
  cleanupAfterDrawing()
  ElMessage.success('Circle drawn successfully')
}

/**
 * Finish line drawing
 */
function finishLine(coordinates: [number, number][]) {
  const geometry: GeoJSON.LineString = {
    type: 'LineString',
    coordinates: coordinates
  }

  addDrawnGeometry(geometry, 'line')
  cleanupAfterDrawing()
  ElMessage.success('Line drawn successfully')
}

/**
 * Add drawn geometry to store
 */
function addDrawnGeometry(geometry: GeoJSON.Geometry, type: 'polygon' | 'circle' | 'line') {
  const id = `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  if (!mapStore.drawnGeometries) {
    console.error('drawnGeometries array not initialized')
    return
  }
  
  const drawnGeometry = {
    id,
    type,
    geometry,
    properties: {
      drawingType: type,
      createdAt: new Date().toISOString()
    },
    createdAt: new Date()
  }
  
  mapStore.drawnGeometries.push(drawnGeometry)
  
  console.log('[DrawingToolbar] Added drawn geometry to mapStore:', drawnGeometry)
  console.log('[DrawingToolbar] mapStore.drawnGeometries length:', mapStore.drawnGeometries.length)

  // Add permanent layer to display the drawing
  addPermanentDrawingLayer(id, geometry, type)
}

/**
 * Add permanent layer for drawn geometry
 */
function addPermanentDrawingLayer(id: string, geometry: GeoJSON.Geometry, type: string) {
  const map = mapStore.mapInstance
  if (!map) return

  const sourceId = `drawing-${id}`
  const layerId = `drawing-layer-${id}`

  map.addSource(sourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: geometry,
      properties: {}
    }
  })

  if (type === 'line') {
    // Line layer
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#67c23a',
        'line-width': 3,
        'line-opacity': 0.9
      }
    })
  } else {
    // Fill layer for polygon/circle
    map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#67c23a',
        'fill-opacity': 0.4
      }
    })
    
    // Add outline layer for polygon/circle
    const outlineLayerId = `${layerId}-outline`
    map.addLayer({
      id: outlineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#67c23a',
        'line-width': 2,
        'line-opacity': 0.9
      }
    })
  }
}

/**
 * Cleanup after drawing completion
 */
function cleanupAfterDrawing() {
  if (currentDrawHandler) {
    currentDrawHandler.cleanup()
    currentDrawHandler = null
  }
  drawingMode.value = null
}

/**
 * Cancel current drawing
 */
function cancelDrawing() {
  if (currentDrawHandler) {
    currentDrawHandler.cleanup()
    currentDrawHandler = null
  }
  drawingMode.value = null
  ElMessage.info('Drawing cancelled')
}

/**
 * Clear all drawings
 */
function clearAllDrawings() {
  const map = mapStore.mapInstance
  if (!map) return

  // Remove all drawing layers and sources
  ;(mapStore.drawnGeometries || []).forEach((drawing: DrawnGeometry) => {
    const sourceId = `drawing-${drawing.id}`
    const layerId = `drawing-layer-${drawing.id}`
    const outlineLayerId = `${layerId}-outline`
  
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
    }
      
    if (map.getLayer(outlineLayerId)) {
      map.removeLayer(outlineLayerId)
    }
  
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId)
    }
  })

  // Clear from store
  if (mapStore.drawnGeometries) {
    mapStore.drawnGeometries.splice(0, mapStore.drawnGeometries.length)
  }
  
  ElMessage.success('All drawings cleared')
}

/**
 * Helper: Check if coordinate is near first point (for closing polygon/line)
 */
function isNearFirstPoint(current: [number, number], first: [number, number], map: any): boolean {
  const threshold = 15 // pixels
  const currentPoint = map.project(current)
  const firstPoint = map.project(first)
  
  const distance = Math.sqrt(
    Math.pow(currentPoint.x - firstPoint.x, 2) +
    Math.pow(currentPoint.y - firstPoint.y, 2)
  )
  
  return distance < threshold
}

/**
 * Helper: Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δφ = (coord2[1] - coord1[1]) * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

/**
 * Helper: Create circle geometry from center and radius
 */
function createCircleGeometry(center: [number, number], radiusMeters: number): GeoJSON.Polygon {
  const points = 64 // Number of vertices
  const earthRadius = 6378137 // WGS84 major axis in meters
  const lat = center[1] * Math.PI / 180
  const lon = center[0] * Math.PI / 180
  const radiusRad = radiusMeters / earthRadius

  const coordinates: [number, number][] = []

  for (let i = 0; i <= points; i++) {
    const bearing = (i / points) * 2 * Math.PI
    
    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(radiusRad) +
      Math.cos(lat) * Math.sin(radiusRad) * Math.cos(bearing)
    )
    
    const lon2 = lon + Math.atan2(
      Math.sin(bearing) * Math.sin(radiusRad) * Math.cos(lat),
      Math.cos(radiusRad) - Math.sin(lat) * Math.sin(lat2)
    )

    coordinates.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI])
  }

  return {
    type: 'Polygon',
    coordinates: [coordinates]
  }
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
