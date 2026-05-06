<template>
  <div 
    class="split-pane"
    @mousedown="startDrag"
  >
    <div class="split-handle"></div>
  </div>
</template>

<script setup lang="ts">

const emit = defineEmits<{
  resize: [ratio: number]
}>()

defineProps<{
  initialRatio?: number
}>()

let isDragging = false
let containerWidth = 0

function startDrag(e: MouseEvent) {
  isDragging = true
  const container = e.target as HTMLElement
  const parentElement = container.parentElement
  
  if (!parentElement) return
  
  containerWidth = parentElement.offsetWidth
  
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  e.preventDefault()
}

function onDrag(e: MouseEvent) {
  if (!isDragging) return
  
  const container = e.target as HTMLElement
  const parentElement = container.parentElement
  
  if (!parentElement) return
  
  const rect = parentElement.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / containerWidth
  
  // Limit range: 30% - 70%
  const clampedRatio = Math.max(0.3, Math.min(0.7, ratio))
  emit('resize', clampedRatio)
}

function stopDrag() {
  isDragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}
</script>

<style scoped lang="scss">
.split-pane {
  width: 4px;
  background: linear-gradient(to right, transparent, #e0e0e0, transparent);
  cursor: col-resize;
  position: relative;
  transition: background 0.2s;
  
  &:hover {
    background: linear-gradient(to right, transparent, #409eff, transparent);
  }
}

.split-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 40px;
  background: #bbb;
  border-radius: 1px;
  opacity: 0;
  transition: opacity 0.2s;
}

.split-pane:hover .split-handle {
  opacity: 1;
}
</style>
