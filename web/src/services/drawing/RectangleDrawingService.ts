/**
 * Rectangle Drawing Service
 * Handles rectangle drawing operations on the map
 * Rectangle is a special case of polygon with 4 vertices
 */

import { DrawingService, DrawingResult } from './DrawingService'
import { createTempGeoJSONLayer, updateTempGeometry, updateVertexMarkers, removeTempLayer, LayerConfig } from './LayerManager'

export class RectangleDrawingService implements DrawingService {
  private map: any = null
  private layerConfig: LayerConfig | null = null
  private firstCorner: [number, number] | null = null
  private currentCorner: [number, number] | null = null
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
    this.firstCorner = null
    this.currentCorner = null
    this.isDrawing = false

    // Create temporary layer for visual feedback
    this.layerConfig = createTempGeoJSONLayer(map, 'rectangle')

    // Setup event handlers
    this.onClickHandler = (e: any) => this.handleClick(e)
    this.onMouseMoveHandler = (e: any) => this.handleMouseMove(e)
    
    // Create debounced version for performance optimization
    this.debouncedMouseMoveHandler = this.debounce(this.onMouseMoveHandler, 16)

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
    this.firstCorner = null
    this.currentCorner = null
    this.isDrawing = false
    this.onClickHandler = null
    this.onMouseMoveHandler = null
    this.debouncedMouseMoveHandler = null
  }

  getMode(): 'polygon' | 'circle' | 'line' | 'rectangle' | null {
    return 'rectangle'
  }

  /**
   * Handle click events during rectangle drawing
   */
  private handleClick(e: any): void {
    const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat]

    if (!this.isDrawing) {
      // First click - set first corner
      this.isDrawing = true
      this.firstCorner = coord
      this.currentCorner = coord
      this.updatePreview()
      this.updateVertices()
    } else {
      // Second click - set opposite corner and finish
      if (this.firstCorner) {
        this.currentCorner = coord
        this.finishRectangle()
      }
    }
  }

  /**
   * Handle mouse move events to update rectangle preview
   */
  private handleMouseMove(e: any): void {
    if (this.isDrawing && this.firstCorner && this.layerConfig && this.map) {
      this.currentCorner = [e.lngLat.lng, e.lngLat.lat]
      this.updatePreview()
      this.updateVertices()
    }
  }

  /**
   * Update preview geometry
   */
  private updatePreview(): void {
    if (!this.layerConfig || !this.map || !this.firstCorner || !this.currentCorner) return

    const rectangleGeometry = this.createRectangleGeometry(this.firstCorner, this.currentCorner)
    updateTempGeometry(this.map, this.layerConfig.sourceId, rectangleGeometry)
  }

  /**
   * Update vertex markers (show 4 corners)
   */
  private updateVertices(): void {
    if (!this.layerConfig || !this.map || !this.firstCorner || !this.currentCorner) return

    const vertices = this.getRectangleVertices(this.firstCorner, this.currentCorner)
    updateVertexMarkers(this.map, this.layerConfig.vertexSourceId, vertices)
  }

  /**
   * Create rectangle geometry from two opposite corners
   */
  private createRectangleGeometry(corner1: [number, number], corner2: [number, number]): GeoJSON.Polygon {
    const vertices = this.getRectangleVertices(corner1, corner2)
    
    // Close the polygon by adding the first vertex at the end
    const closedVertices = [...vertices, vertices[0]]

    return {
      type: 'Polygon',
      coordinates: [closedVertices]
    }
  }

  /**
   * Get the 4 vertices of the rectangle
   */
  private getRectangleVertices(corner1: [number, number], corner2: [number, number]): [number, number][] {
    const [lon1, lat1] = corner1
    const [lon2, lat2] = corner2

    // Calculate the 4 corners of the rectangle
    return [
      [lon1, lat1], // Bottom-left (or top-left depending on coordinates)
      [lon2, lat1], // Bottom-right
      [lon2, lat2], // Top-right
      [lon1, lat2]  // Top-left
    ]
  }

  /**
   * Finish rectangle drawing and notify completion
   */
  private finishRectangle(): void {
    if (!this.firstCorner || !this.currentCorner) return

    const geometry = this.createRectangleGeometry(this.firstCorner, this.currentCorner)

    const result: DrawingResult = {
      geometry,
      type: 'rectangle',
      properties: {
        drawingType: 'rectangle',
        createdAt: new Date().toISOString(),
        corner1: this.firstCorner,
        corner2: this.currentCorner
      }
    }

    // Notify completion
    if (this.onCompletionCallback) {
      this.onCompletionCallback(result)
    }

    this.cleanup()
  }

  /**
   * Simple debounce implementation for mouse move events
   */
  private debounce<T extends (...args: any[]) => void>(
    func: T,
    wait: number = 16
  ): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null

    return function executedFunction(...args: Parameters<T>): void {
      const later = () => {
        timeout = null
        func(...args)
      }

      if (timeout !== null) {
        clearTimeout(timeout)
      }

      timeout = setTimeout(later, wait)
    }
  }
}
