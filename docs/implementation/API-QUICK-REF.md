# Data Management API - Quick Reference

## Base URL
```
http://localhost:3000/api
```

## Endpoints

### Data Sources
```bash
# List all data sources
GET /api/data-sources

# Get available sources (for LLM)
GET /api/data-sources/available

# Search data sources
GET /api/data-sources/search?q={query}

# Get data source by ID
GET /api/data-sources/{id}

# Get schema
GET /api/data-sources/{id}/schema

# Update metadata
PUT /api/data-sources/{id}/metadata
Body: { "metadata": { ... } }

# Register PostGIS connection
POST /api/data-sources/postgis
Body: {
  "host": "localhost",
  "port": 5432,
  "database": "mydb",
  "user": "postgres",
  "password": "secret",
  "schema": "public"
}

# Delete data source
DELETE /api/data-sources/{id}
```

### File Upload
```bash
# Upload single file
POST /api/upload/single
Content-Type: multipart/form-data
Field: file

# Upload multiple files (shapefile)
POST /api/upload/multiple
Content-Type: multipart/form-data
Field: files (array)
```

### System
```bash
# Health check
GET /health
```

## Test Scripts

```bash
# Run all tests
node scripts/test-data-management.js    # Core API tests
node scripts/test-file-upload.js        # Upload tests
node scripts/test-complete-workflow.js  # E2E workflow
```

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "count": 5
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Common Status Codes

- `200` - Success (GET, PUT)
- `201` - Created (POST)
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

## Supported File Types

- `.geojson`, `.json` - GeoJSON
- `.shp`, `.shx`, `.dbf`, `.prj` - Shapefile
- `.tif`, `.tiff` - GeoTIFF
- `.csv` - CSV with coordinates

## File Size Limit
**Maximum:** 100 MB per file

## Example Workflow

```javascript
// 1. Upload file
const upload = await fetch('/api/upload/single', {
  method: 'POST',
  body: formData // with file
});
const { data } = await upload.json();
const dataSourceId = data.id;

// 2. Get details
const details = await fetch(`/api/data-sources/${dataSourceId}`);

// 3. Get schema
const schema = await fetch(`/api/data-sources/${dataSourceId}/schema`);

// 4. Update metadata
await fetch(`/api/data-sources/${dataSourceId}/metadata`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    metadata: {
      description: 'My data',
      tags: ['test', 'important']
    }
  })
});

// 5. Search
const search = await fetch('/api/data-sources/search?q=world');
```

## Hot Reload Status

✅ Backend: Auto-recompiles on TypeScript changes  
✅ Frontend: Vue components update without refresh  
✅ No manual restarts needed  

## Database Location
```
workspace/database/geoai-up.db
```

## Data Storage
```
workspace/data/local/     # Uploaded files
workspace/results/        # Processing results
```

## Need Help?

Check detailed documentation:
- `scripts/README-TESTS.md` - Complete test documentation
- `scripts/TEST-RESULTS.md` - Latest test results
- `docs/architecture/` - Architecture docs

---

**Quick Tips:**
- Always check `success` field in responses
- Use `/available` endpoint for LLM context
- Search is case-insensitive
- Metadata updates are immediate
- Uploaded files get timestamp suffixes
