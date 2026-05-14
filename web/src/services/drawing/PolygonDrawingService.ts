/**
 * Polygon Drawing Service
 * Handles polygon drawing operations on the map
 */

import { DrawingService, DrawingResult } from './DrawingService'
import { createTempGeoJSONLayer, updateTempGeometry, updateVertexMarkers, removeTempLayer, LayerConfig } from './LayerManager'
import { isNearFirstPoint, ensurePolygonClosed } from './GeometryUtils'

export class PolygonDrawingService implements DrawingService {
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
    this.layerConfig = createTempGeoJSONLayer(map, 'polygon')

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
    return 'polygon'
  }

  /**
   * Handle click events during polygon drawing
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
      
      // Check if clicked near first point to close polygon
      if (this.coordinates.length > 2 && 
          this.map && 
          isNearFirstPoint(coord, this.coordinates[0], this.map)) {
        this.finishPolygon()
      }
    }
  }

  /**
   * Handle double-click events to finish polygon
   */
  private handleDoubleClick(e: any): void {
    if (this.isDrawing && this.coordinates.length > 2) {
      e.originalEvent.stopPropagation()
      e.originalEvent.preventDefault()
      this.finishPolygon()
    }
  }

  /**
   * Update preview geometry
   */
  private updatePreview(): void {
    if (!this.layerConfig || !this.map) return

    const closedCoords = [...this.coordinates, this.coordinates[0]]
    const geometry: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [closedCoords]
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
   * Finish polygon drawing and notify completion
   */
  private finishPolygon(): void {
    if (this.coordinates.length < 3) return

    // Ensure polygon is closed
    const closedCoordinates = ensurePolygonClosed(this.coordinates)

    const geometry: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [closedCoordinates]
    }

    const result: DrawingResult = {
      geometry,
      type: 'polygon',
      properties: {
        drawingType: 'polygon',
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
