/**
 * Circle Drawing Service
 * Handles circle drawing operations on the map
 */

import { DrawingService, DrawingResult } from './DrawingService'
import { createTempGeoJSONLayer, updateTempGeometry, removeTempLayer, LayerConfig } from './LayerManager'
import { calculateDistance, createCircleGeometry, debounce } from './GeometryUtils'

export class CircleDrawingService implements DrawingService {
  private map: any = null
  private layerConfig: LayerConfig | null = null
  private center: [number, number] | null = null
  private radius: number = 0
  private isDrawing: boolean = false
  private onClickHandler: ((e: any) => void) | null = null
  private onMouseMoveHandler: ((e: any) => void) | null = null
  private debouncedMouseMoveHandler: ((e: any) => void) | null = null
  private onCompletionCallback: ((result: DrawingResult) => void) | null = null

  /**
   * Set completion callback
   * @param callback - Function to call when drawing is complete
   */
  setCompletionCallback(callback: (result: DrawingResult) => void) {
    this.onCompletionCallback = callback
  }

  startDrawing(map: any): void {
    this.map = map
    this.center = null
    this.radius = 0
    this.isDrawing = false

    // Create temporary layer for visual feedback
    this.layerConfig = createTempGeoJSONLayer(map, 'circle')

    // Setup event handlers
    this.onClickHandler = (e: any) => this.handleClick(e)
    this.onMouseMoveHandler = (e: any) => this.handleMouseMove(e)
    
    // Create debounced version for performance optimization
    this.debouncedMouseMoveHandler = debounce(this.onMouseMoveHandler, 16)

    map.on('click', this.onClickHandler)
    map.on('mousemove', this.debouncedMouseMoveHandler)
  }

  stopDrawing(): void {
    this.cleanup()
  }

  cleanup(): void {
    if (this.map) {
      if (this.onClickHandler) {
        this.map.off('click', this.onClickHandler)
      }
      if (this.debouncedMouseMoveHandler) {
        this.map.off('mousemove', this.debouncedMouseMoveHandler)
      }
    }

    if (this.layerConfig && this.map) {
      removeTempLayer(this.map, this.layerConfig)
    }

    this.map = null
    this.layerConfig = null
    this.center = null
    this.radius = 0
    this.isDrawing = false
    this.onClickHandler = null
    this.onMouseMoveHandler = null
    this.debouncedMouseMoveHandler = null
  }

  getMode(): 'polygon' | 'circle' | 'line' | null {
    return 'circle'
  }

  /**
   * Handle click events during circle drawing
   */
  private handleClick(e: any): void {
    const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat]

    if (!this.isDrawing) {
      // First click - set center
      this.isDrawing = true
      this.center = coord
    } else {
      // Second click - set radius and finish
      if (this.center) {
        this.radius = calculateDistance(this.center, coord)
        this.finishCircle()
      }
    }
  }

  /**
   * Handle mouse move events to update circle preview
   */
  private handleMouseMove(e: any): void {
    if (this.isDrawing && this.center && this.layerConfig && this.map) {
      const currentCoord: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      this.radius = calculateDistance(this.center, currentCoord)
      
      const circleGeometry = createCircleGeometry(this.center, this.radius)
      updateTempGeometry(this.map, this.layerConfig.sourceId, circleGeometry)
    }
  }

  /**
   * Finish circle drawing and notify completion
   */
  private finishCircle(): void {
    if (!this.center || this.radius === 0) return

    const geometry = createCircleGeometry(this.center, this.radius)

    const result: DrawingResult = {
      geometry,
      type: 'circle',
      properties: {
        drawingType: 'circle',
        createdAt: new Date().toISOString(),
        center: this.center,
        radius: this.radius
      }
    }

    // Notify completion
    if (this.onCompletionCallback) {
      this.onCompletionCallback(result)
    }

    this.cleanup()
  }
}
