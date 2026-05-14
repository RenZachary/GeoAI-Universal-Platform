/**
 * Drawing Manager
 * Central coordinator for all drawing operations
 * Manages active drawing service and provides unified API
 */

import { DrawingService, DrawingResult } from './DrawingService'
import { PolygonDrawingService } from './PolygonDrawingService'
import { CircleDrawingService } from './CircleDrawingService'
import { LineDrawingService } from './LineDrawingService'
import { RectangleDrawingService } from './RectangleDrawingService'

export type DrawingMode = 'polygon' | 'circle' | 'line' | 'rectangle' | null
export type { DrawingResult }

export class DrawingManager {
  private currentService: DrawingService | null = null
  private drawingMode: DrawingMode = null
  private currentMap: any = null
  private onDrawingCompleteCallback: ((result: DrawingResult) => void) | null = null

  /**
   * Set callback for when drawing is complete
   * @param callback - Function to call with drawing result
   */
  setOnDrawingComplete(callback: (result: DrawingResult) => void) {
    this.onDrawingCompleteCallback = callback
  }

  /**
   * Start drawing mode
   * @param mode - Drawing mode (polygon, circle, line, or rectangle)
   * @param map - MapLibre map instance
   */
  startDrawing(mode: 'polygon' | 'circle' | 'line' | 'rectangle', map: any): void {
    // If already in this mode, cancel it
    if (this.drawingMode === mode) {
      this.stopDrawing()
      return
    }

    // Cancel any existing drawing
    if (this.drawingMode) {
      this.stopDrawing()
    }

    this.drawingMode = mode
    this.currentMap = map

    // Create appropriate service based on mode
    switch (mode) {
      case 'polygon':
        this.currentService = new PolygonDrawingService()
        break
      case 'circle':
        this.currentService = new CircleDrawingService()
        break
      case 'line':
        this.currentService = new LineDrawingService()
        break
      case 'rectangle':
        this.currentService = new RectangleDrawingService()
        break
    }

    // Set completion callback
    if (this.currentService && this.onDrawingCompleteCallback) {
      this.currentService.setCompletionCallback(this.onDrawingCompleteCallback)
    }

    // Start drawing
    if (this.currentService) {
      this.currentService.startDrawing(map)
    }

    // Change cursor to crosshair
    this.updateCursor(map, 'crosshair')
  }

  /**
   * Stop current drawing operation
   */
  stopDrawing(): void {
    const map = this.currentMap
    
    if (this.currentService) {
      this.currentService.cleanup()
      this.currentService = null
    }
    this.drawingMode = null
    this.currentMap = null

    // Reset cursor
    if (map) {
      this.updateCursor(map, '')
    }
  }

  /**
   * Get current drawing mode
   */
  getMode(): DrawingMode {
    return this.drawingMode
  }

  /**
   * Check if currently drawing
   */
  isDrawing(): boolean {
    return this.drawingMode !== null
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    this.stopDrawing()
    this.onDrawingCompleteCallback = null
  }

  /**
   * Update map cursor style
   * @param map - MapLibre map instance
   * @param cursor - Cursor style (e.g., 'crosshair', 'pointer', '')
   */
  private updateCursor(map: any, cursor: string): void {
    if (!map) return

    try {
      map.getCanvas().style.cursor = cursor
    } catch (error) {
      console.warn('[DrawingManager] Failed to update cursor:', error)
    }
  }
}

// Export singleton instance
export const drawingManager = new DrawingManager()
