/**
 * Drawing Services - Index
 * Central export point for all drawing-related services and utilities
 */

// Core interfaces and types
export type { DrawingService, DrawingResult, DrawingEventHandler } from './DrawingService'
export type { DrawingMode } from './DrawingManager'

// Manager
export { DrawingManager, drawingManager } from './DrawingManager'

// Drawing Services
export { PolygonDrawingService } from './PolygonDrawingService'
export { CircleDrawingService } from './CircleDrawingService'
export { LineDrawingService } from './LineDrawingService'
export { RectangleDrawingService } from './RectangleDrawingService'

// Utilities
export { 
  calculateDistance, 
  createCircleGeometry, 
  isNearFirstPoint,
  ensurePolygonClosed,
  generateDrawingId,
  debounce
} from './GeometryUtils'

export {
  createTempGeoJSONLayer,
  updateTempGeometry,
  removeTempLayer,
  addPermanentDrawingLayer,
  clearAllDrawingLayers,
  type LayerConfig
} from './LayerManager'
