# MVT Dynamic Publisher API Documentation

## Overview

The MVT Dynamic Publisher is an independent module that publishes dynamic Mapbox Vector Tile (MVT) services from various data sources. Unlike pre-generated tiles, this module generates tiles **on-demand** when requested, making it ideal for:

- Large datasets where pre-generation would be impractical
- Frequently updated data sources
- PostGIS databases with native MVT support
- Temporary or experimental visualizations

## Architecture

```
┌─────────────────────────────────────────────────┐
│         MVTDynamicPublisher Module              │
├─────────────────────────────────────────────────┤
│ Input Sources:                                  │
│  • GeoJSON FeatureCollection (in-memory)        │
│  • GeoJSON file path                            │
│  • PostGIS connection + table/SQL               │
├─────────────────────────────────────────────────┤
│ Processing:                                     │
│  • geojson-vt for GeoJSON (tile index in RAM)   │
│  • ST_AsMVT() for PostGIS (database query)      │
├─────────────────────────────────────────────────┤
│ Output:                                         │
│  • tilesetId (unique identifier)                │
│  • Service URL template                         │
│  • On-demand tile generation                    │
└─────────────────────────────────────────────────┘
```

## API Endpoints

### 1. Publish MVT Service

**Endpoint:** `POST /api/mvt-dynamic/publish`

**Description:** Publish a new dynamic MVT service from a data source.

#### Request Body Examples

##### Example 1: In-Memory GeoJSON

```json
{
  "source": {
    "type": "geojson-memory",
    "featureCollection": {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": [116.4074, 39.9042]
          },
          "properties": {
            "name": "Beijing"
          }
        }
      ]
    }
  },
  "options": {
    "minZoom": 0,
    "maxZoom": 10,
    "layerName": "cities"
  }
}
```

##### Example 2: GeoJSON File

```json
{
  "source": {
    "type": "geojson-file",
    "filePath": "/path/to/workspace/data/local/世界.geojson"
  },
  "options": {
    "minZoom": 0,
    "maxZoom": 8,
    "layerName": "countries"
  }
}
```

##### Example 3: PostGIS Table

```json
{
  "source": {
    "type": "postgis",
    "connection": {
      "host": "localhost",
      "port": 5432,
      "database": "gis_db",
      "user": "postgres",
      "password": "password",
      "schema": "public"
    },
    "tableName": "provinces",
    "geometryColumn": "geom"
  },
  "options": {
    "minZoom": 0,
    "maxZoom": 12,
    "layerName": "provinces"
  }
}
```

##### Example 4: PostGIS Custom SQL

```json
{
  "source": {
    "type": "postgis",
    "connection": {
      "host": "localhost",
      "port": 5432,
      "database": "gis_db",
      "user": "postgres",
      "password": "password"
    },
    "sqlQuery": "SELECT geom, name, population FROM cities WHERE population > 1000000",
    "geometryColumn": "geom"
  },
  "options": {
    "minZoom": 4,
    "maxZoom": 14,
    "layerName": "large_cities"
  }
}
```

#### Options Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `minZoom` | number | 0 | Minimum zoom level |
| `maxZoom` | number | 14 | Maximum zoom level |
| `extent` | number | 4096 | Tile extent (vector tile coordinate space) |
| `tolerance` | number | 3 | Simplification tolerance |
| `buffer` | number | 64 | Buffer size around tiles |
| `layerName` | string | "default" | Layer name in the tile |

#### Response

**Success (201 Created):**

```json
{
  "success": true,
  "data": {
    "tilesetId": "geojson_1714838400000_abc123",
    "serviceUrl": "/api/mvt-dynamic/geojson_1714838400000_abc123/{z}/{x}/{y}.pbf",
    "metadata": {
      "sourceType": "geojson-memory",
      "minZoom": 0,
      "maxZoom": 10,
      "extent": 4096,
      "generatedAt": "2026-05-04T12:00:00.000Z",
      "featureCount": 1,
      "cacheEnabled": true
    }
  }
}
```

**Error (400/500):**

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

---

### 2. Get MVT Tile

**Endpoint:** `GET /api/mvt-dynamic/:tilesetId/:z/:x/:y.pbf`

**Description:** Retrieve a single MVT tile. Tiles are generated on-demand and cached in memory.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tilesetId` | string | Yes | The tileset ID returned from publish endpoint |
| `z` | number | Yes | Zoom level (0-22) |
| `x` | number | Yes | X coordinate (column) |
| `y` | number | Yes | Y coordinate (row) |

#### Response

**Success (200 OK):**
- Content-Type: `application/x-protobuf`
- Binary PBF data

**Tile Not Found (404):**

```json
{
  "success": false,
  "error": "Tile not found",
  "tilesetId": "geojson_1714838400000_abc123",
  "z": 5,
  "x": 100,
  "y": 100
}
```

---

### 3. List Published Tilesets

**Endpoint:** `GET /api/mvt-dynamic/list`

**Description:** List all currently published dynamic MVT tilesets.

#### Response

```json
{
  "success": true,
  "data": {
    "count": 2,
    "tilesets": [
      {
        "tilesetId": "geojson_1714838400000_abc123",
        "serviceUrl": "/api/mvt-dynamic/geojson_1714838400000_abc123/{z}/{x}/{y}.pbf",
        "metadata": {
          "sourceType": "geojson-memory",
          "minZoom": 0,
          "maxZoom": 10,
          "extent": 4096,
          "generatedAt": "2026-05-04T12:00:00.000Z",
          "featureCount": 100,
          "cacheEnabled": true
        }
      },
      {
        "tilesetId": "postgis_1714838500000_xyz789",
        "serviceUrl": "/api/mvt-dynamic/postgis_1714838500000_xyz789/{z}/{x}/{y}.pbf",
        "metadata": {
          "sourceType": "postgis",
          "minZoom": 0,
          "maxZoom": 12,
          "extent": 4096,
          "generatedAt": "2026-05-04T12:01:40.000Z",
          "tableName": "provinces",
          "cacheEnabled": true
        }
      }
    ]
  }
}
```

---

### 4. Get Tileset Metadata

**Endpoint:** `GET /api/mvt-dynamic/:tilesetId/metadata`

**Description:** Get detailed metadata for a specific tileset.

#### Response

```json
{
  "success": true,
  "data": {
    "tilesetId": "geojson_1714838400000_abc123",
    "serviceUrl": "/api/mvt-dynamic/geojson_1714838400000_abc123/{z}/{x}/{y}.pbf",
    "metadata": {
      "sourceType": "geojson-memory",
      "minZoom": 0,
      "maxZoom": 10,
      "extent": 4096,
      "generatedAt": "2026-05-04T12:00:00.000Z",
      "featureCount": 100,
      "cacheEnabled": true
    }
  }
}
```

---

### 5. Delete Tileset

**Endpoint:** `DELETE /api/mvt-dynamic/:tilesetId`

**Description:** Delete a published tileset and free up resources (memory cache, database connections).

#### Response

**Success (200 OK):**

```json
{
  "success": true,
  "message": "Tileset deleted: geojson_1714838400000_abc123"
}
```

**Not Found (404):**

```json
{
  "success": false,
  "error": "Tileset not found: geojson_1714838400000_abc123"
}
```

---

## Usage Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

// 1. Publish a GeoJSON file
const publishResponse = await axios.post('http://localhost:3000/api/mvt-dynamic/publish', {
  source: {
    type: 'geojson-file',
    filePath: '/workspace/data/local/世界.geojson'
  },
  options: {
    minZoom: 0,
    maxZoom: 8,
    layerName: 'countries'
  }
});

const { tilesetId, serviceUrl } = publishResponse.data.data;
console.log(`Published: ${serviceUrl}`);

// 2. Use with Leaflet
import L from 'leaflet';

const map = L.map('map').setView([35.8617, 104.1954], 4);

L.tileLayer(`${serviceUrl.replace('{z}/{x}/{y}', '{z}/{x}/{y}.pbf')}`, {
  attribution: 'GeoAI-UP'
}).addTo(map);
```

### cURL

```bash
# Publish GeoJSON file
curl -X POST http://localhost:3000/api/mvt-dynamic/publish \
  -H "Content-Type: application/json" \
  -d '{
    "source": {
      "type": "geojson-file",
      "filePath": "/workspace/data/local/世界.geojson"
    },
    "options": {
      "minZoom": 0,
      "maxZoom": 8
    }
  }'

# Get a tile
curl http://localhost:3000/api/mvt-dynamic/geojson_1714838400000_abc123/5/20/10.pbf \
  --output tile.pbf

# List tilesets
curl http://localhost:3000/api/mvt-dynamic/list

# Delete tileset
curl -X DELETE http://localhost:3000/api/mvt-dynamic/geojson_1714838400000_abc123
```

---

## Performance Characteristics

### GeoJSON Sources

- **Memory Usage**: Tile index stored in RAM (~10-100MB depending on data size)
- **First Tile**: ~50-200ms (tile generation from index)
- **Subsequent Tiles**: ~5-20ms (cached in memory)
- **Cache Size**: Configurable (default: 10,000 tiles)

### PostGIS Sources

- **Memory Usage**: Connection pool only (~1-5MB)
- **First Tile**: ~100-500ms (database query + ST_AsMVT)
- **Subsequent Tiles**: ~50-200ms (cached)
- **Scalability**: Excellent for large datasets (millions of features)

---

## Comparison: Dynamic vs Pre-generated

| Feature | Dynamic Publisher | Pre-generated (MVTPublisher) |
|---------|-------------------|------------------------------|
| **Generation Time** | Instant (no pre-processing) | Minutes to hours |
| **Storage** | Minimal (metadata only) | GBs of tile files |
| **Data Updates** | Immediate | Requires regeneration |
| **First Access** | Slower (generation) | Fast (pre-generated) |
| **Best For** | Large/dynamic datasets | Small/static datasets |
| **PostGIS Support** | ✅ Native ST_AsMVT() | ❌ Not yet implemented |

---

## Best Practices

1. **Choose the Right Source Type**
   - Small datasets (< 10MB): Use `geojson-memory` or `geojson-file`
   - Large datasets (> 10MB): Use PostGIS with custom SQL queries
   - Real-time updates: Always use dynamic publisher

2. **Optimize Zoom Levels**
   - Don't set `maxZoom` higher than necessary
   - Each zoom level doubles the potential tile count

3. **Use Caching**
   - The module includes built-in in-memory caching
   - Consider adding Redis or CDN for production deployments

4. **Clean Up Unused Tilesets**
   - Call `DELETE /api/mvt-dynamic/:tilesetId` when done
   - This frees memory and database connections

5. **PostGIS Optimization**
   - Ensure spatial indexes exist: `CREATE INDEX ON table USING GIST (geom)`
   - Use filtered SQL queries to reduce data volume
   - Set appropriate `maxZoom` based on data density

---

## Troubleshooting

### Issue: "Tile not found"

**Possible Causes:**
- Tile coordinates out of range (check minZoom/maxZoom)
- Empty tile (no features in that area)
- Tileset was deleted

**Solution:**
- Verify zoom level is within range
- Check if features exist at that location
- List tilesets to confirm it still exists

### Issue: Slow tile generation

**Possible Causes:**
- Large GeoJSON dataset
- Complex PostGIS query without indexes
- High zoom levels

**Solution:**
- For GeoJSON: Reduce feature count or simplify geometries
- For PostGIS: Add spatial indexes, optimize SQL query
- Lower maxZoom if high detail isn't needed

### Issue: Memory usage too high

**Possible Causes:**
- Too many tilesets published
- Large GeoJSON tile indexes in memory
- Cache size too large

**Solution:**
- Delete unused tilesets
- Reduce cache size in constructor: `new MVTDynamicPublisher(workspaceBase, 5000)`
- Use PostGIS instead of GeoJSON for very large datasets
