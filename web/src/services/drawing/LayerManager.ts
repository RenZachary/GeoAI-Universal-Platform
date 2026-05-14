/**
 * Layer Manager
 * Handles creation, update, and removal of map layers for drawing
 */

export interface LayerConfig {
  sourceId: string;
  layerId: string;
  outlineLayerId?: string;
  vertexSourceId?: string;
  vertexLayerId?: string;
  type: 'polygon' | 'circle' | 'line' | 'rectangle';
}

/**
 * Create temporary GeoJSON layer for drawing visualization
 * @param map - MapLibre map instance
 * @param type - Geometry type
 * @returns Layer configuration
 */
export function createTempGeoJSONLayer(map: any, type: string): LayerConfig {
  const timestamp = Date.now()
  const tempSourceId = `draw-temp-${timestamp}`
  const tempLayerId = `draw-layer-${tempSourceId}`
  const vertexSourceId = `draw-vertex-${timestamp}`
  const vertexLayerId = `draw-vertex-layer-${timestamp}`

  map.addSource(tempSourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: null,
      properties: {}
    }
  })

  // Add vertex markers source (for polygon, line, and rectangle)
  if (type !== 'circle') {
    map.addSource(vertexSourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    })

    // Add vertex markers layer
    map.addLayer({
      id: vertexLayerId,
      type: 'circle',
      source: vertexSourceId,
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#409eff',
        'circle-opacity': 0.9
      }
    })
  }

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
        'fill-opacity': 0.2
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
    
    return {
      sourceId: tempSourceId,
      layerId: tempLayerId,
      outlineLayerId,
      vertexSourceId: type !== 'circle' ? vertexSourceId : undefined,
      vertexLayerId: type !== 'circle' ? vertexLayerId : undefined,
      type: type as 'polygon' | 'circle' | 'line' | 'rectangle'
    }
  }

  return {
    sourceId: tempSourceId,
    layerId: tempLayerId,
    vertexSourceId,
    vertexLayerId,
    type: type as 'polygon' | 'circle' | 'line' | 'rectangle'
  }
}

/**
 * Update temporary geometry
 * @param map - MapLibre map instance
 * @param sourceId - Source ID
 * @param geometry - GeoJSON geometry
 */
export function updateTempGeometry(map: any, sourceId: string, geometry: GeoJSON.Geometry | null) {
  if (!map || !sourceId) return

  const source = map.getSource(sourceId)
  if (source) {
    source.setData({
      type: 'Feature',
      geometry: geometry,
      properties: {}
    })
  }
}

/**
 * Update vertex markers
 * @param map - MapLibre map instance
 * @param vertexSourceId - Vertex source ID
 * @param coordinates - Array of coordinates to display as vertices
 */
export function updateVertexMarkers(map: any, vertexSourceId: string | undefined, coordinates: [number, number][]) {
  if (!map || !vertexSourceId) return

  const source = map.getSource(vertexSourceId)
  if (source) {
    const features: GeoJSON.Feature[] = coordinates.map(coord => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: coord
      },
      properties: {}
    }))

    source.setData({
      type: 'FeatureCollection',
      features: features
    })
  }
}

/**
 * Remove temporary layer
 * @param map - MapLibre map instance
 * @param config - Layer configuration
 */
export function removeTempLayer(map: any, config: LayerConfig | null) {
  if (!map || !config) return

  if (config.layerId && map.getLayer(config.layerId)) {
    map.removeLayer(config.layerId)
  }
  
  // Remove outline layer if exists
  if (config.outlineLayerId && map.getLayer(config.outlineLayerId)) {
    map.removeLayer(config.outlineLayerId)
  }

  // Remove vertex layer if exists
  if (config.vertexLayerId && map.getLayer(config.vertexLayerId)) {
    map.removeLayer(config.vertexLayerId)
  }

  if (config.sourceId && map.getSource(config.sourceId)) {
    map.removeSource(config.sourceId)
  }

  // Remove vertex source if exists
  if (config.vertexSourceId && map.getSource(config.vertexSourceId)) {
    map.removeSource(config.vertexSourceId)
  }
}

/**
 * Add permanent layer for drawn geometry
 * @param map - MapLibre map instance
 * @param id - Drawing ID
 * @param geometry - GeoJSON geometry
 * @param type - Geometry type
 */
export function addPermanentDrawingLayer(
  map: any,
  id: string,
  geometry: GeoJSON.Geometry,
  type: string
) {
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
 * Clear all drawing layers
 * @param map - MapLibre map instance
 * @param drawings - Array of drawn geometries
 */
export function clearAllDrawingLayers(map: any, drawings: Array<{ id: string }>) {
  if (!map) return

  drawings.forEach((drawing) => {
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
}
