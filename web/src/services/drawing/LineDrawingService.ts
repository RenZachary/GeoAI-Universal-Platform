/**
 * Line Drawing Service
 * Handles line drawing operations on the map
 */

import { DrawingService, DrawingResult } from './DrawingService'
import { createTempGeoJSONLayer, updateTempGeometry, updateVertexMarkers, removeTempLayer, LayerConfig } from './LayerManager'
import { isNearFirstPoint } from './GeometryUtils'

export class LineDrawingService implements DrawingService {
  private map: any = null
  private layerConfig: LayerConfig | null = null
  private coordinates: [number, number][] = []
  private isDrawing: boolean = false
  private onClickHandler: ((e: any) => void) | null = null
  private onDoubleClickHandler: ((e: any) => void) | null = null
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
    this.coordinates = []
    this.isDrawing = false

    // Create temporary layer for visual feedback
    this.layerConfig = createTempGeoJSONLayer(map, 'line')

    // Setup event handlers
    this.onClickHandler = (e: any) => this.handleClick(e)
    this.onDoubleClickHandler = (e: any) => this.handleDoubleClick(e)

    map.on('click', this.onClickHandler)
    map.on('dblclick', this.onDoubleClickHandler)
  }

  stopDrawing(): void {
    this.cleanup()
  }

  cleanup(): void {
    if (this.map) {
      if (this.onClickHandler) {
        this.map.off('click', this.onClickHandler)
      }
      if (this.onDoubleClickHandler) {
        this.map.off('dblclick', this.onDoubleClickHandler)
      }
    }

    if (this.layerConfig && this.map) {
      removeTempLayer(this.map, this.layerConfig)
    }

    this.map = null
    this.layerConfig = null
    this.coordinates = []
    this.isDrawing = false
    this.onClickHandler = null
    this.onDoubleClickHandler = null
  }

  getMode(): 'polygon' | 'circle' | 'line' | null {
    return 'line'
  }

  /**
   * Handle click events during line drawing
   */
  private handleClick(e: any): void {
    const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat]
    
    if (!this.isDrawing) {
      // First click - start drawing
      this.isDrawing = true
      this.coordinates.push(coord)
      this.updatePreview()
      this.updateVertices()
    } else {
      // Subsequent clicks - add points
      this.coordinates.push(coord)
      this.updatePreview()
      this.updateVertices()
      
      // Check if clicked near first point to close line
      if (this.coordinates.length > 1 && 
          this.map && 
          isNearFirstPoint(coord, this.coordinates[0], this.map)) {
        this.finishLine([...this.coordinates, this.coordinates[0]]) // Close the line
      }
    }
  }

  /**
   * Handle double-click events to finish line
   */
  private handleDoubleClick(e: any): void {
    if (this.isDrawing && this.coordinates.length > 1) {
      e.originalEvent.stopPropagation()
      e.originalEvent.preventDefault()
      this.finishLine(this.coordinates)
    }
  }

  /**
   * Update preview geometry
   */
  private updatePreview(): void {
    if (!this.layerConfig || !this.map) return

    const geometry: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: [...this.coordinates]
    }

    updateTempGeometry(this.map, this.layerConfig.sourceId, geometry)
  }

  /**
   * Update vertex markers
   */
  private updateVertices(): void {
    if (!this.layerConfig || !this.map) return

    updateVertexMarkers(this.map, this.layerConfig.vertexSourceId, this.coordinates)
  }

  /**
   * Finish line drawing and notify completion
   */
  private finishLine(coords: [number, number][]): void {
    if (coords.length < 2) return

    const geometry: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: coords
    }

    const result: DrawingResult = {
      geometry,
      type: 'line',
      properties: {
        drawingType: 'line',
        createdAt: new Date().toISOString()
      }
    }

    // Notify completion
    if (this.onCompletionCallback) {
      this.onCompletionCallback(result)
    }

    this.cleanup()
  }
}
