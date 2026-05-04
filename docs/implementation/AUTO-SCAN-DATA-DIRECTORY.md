# Auto-Scan Data Directory Feature

## Overview

The server now automatically scans the `workspace/data/local/` directory on startup and registers any unregistered files with full metadata extraction.

**Key Design Principle**: All data source files are stored in `workspace/data/local/`. The database never stores references to temporary upload directories.

## How It Works

### File Upload Flow

1. **User uploads file** → Multer saves to temporary location
2. **FileUploadService processes** → Moves file from temp to `workspace/data/local/`
3. **Metadata extraction** → Extracts feature count, fields, CRS, etc.
4. **Database registration** → Stores reference to `workspace/data/local/filename`
5. **Cleanup** → Removes temporary file

### On Server Startup (Auto-Scan)

1. **Scan Directory**: Reads all files in `workspace/data/local/`
2. **Check Existing**: Compares against database records to avoid duplicates
3. **Register New Files**: Uses `FileUploadService` to properly extract metadata:
   - Feature count
   - Field names
   - CRS information
   - File size
   - Bounding box (if available)

### Supported File Types

- `.geojson`, `.json` - GeoJSON files
- `.shp` - Shapefile (requires .shx, .dbf components)
- `.tif`, `.tiff` - GeoTIFF raster files
- `.csv` - CSV with coordinates

## Benefits

✅ **No Manual Upload Required**: Files placed in the directory are auto-detected  
✅ **Complete Metadata**: Uses the same extraction logic as file uploads  
✅ **Idempotent**: Safe to restart multiple times - won't create duplicates  
✅ **Error Handling**: Continues scanning even if individual files fail  

## Example Output

```
Scanning data directory for existing files...
  Found 10 files in data directory
    Registering: world.geojson
    Registering: 世界.geojson
    Registering: 中国-省级行政区划边界.geojson
    ...
  Registration complete: 10 new, 0 already registered
```

On subsequent restarts:
```
Scanning data directory for existing files...
  Found 10 files in data directory
  Registration complete: 0 new, 10 already registered
```

## Implementation Details

**Location**: `server/src/utils/DataDirectoryScanner.ts`  
**Function**: `scanAndRegisterDataFiles()`  
**Called**: During server initialization in `server/src/index.ts`

**File Upload Service Location**: `server/src/services/FileUploadService.ts`

**Process**:
```typescript
// Auto-scan on startup
1. Read workspace/data/local/ directory
2. Filter supported file types
3. Check database for existing registrations
4. For each new file:
   - Call FileUploadService.processSingleFile()
   - Extract metadata via appropriate Accessor
   - Save to database with full metadata
5. Log results

// Normal upload flow
1. Multer receives file → saves to temp/
2. FileUploadService.processSingleFile():
   a. Detect file type
   b. Generate unique filename: timestamp_originalname
   c. Copy file from temp/ to data/local/
   d. Delete temp file
   e. Validate file
   f. Extract metadata
   g. Register in database with path to data/local/
```

**Key Points**:
- ✅ Files always end up in `workspace/data/local/`
- ✅ Database only references `workspace/data/local/` paths
- ✅ Temporary files are cleaned up immediately
- ✅ Unique filenames prevent collisions (timestamp prefix)

## Use Cases

### Fresh Installation
1. Copy GeoJSON files to `workspace/data/local/`
2. Start server
3. All files automatically registered with metadata ✅

### Database Reset
1. Delete `workspace/database/geoai-up.db`
2. Restart server
3. Files re-registered automatically ✅

### Adding New Data
1. Place new files in `workspace/data/local/`
2. Restart server (or use upload API)
3. New files detected and registered ✅

## Comparison: Before vs After

### Before (Inconsistent Storage)
```
User Action          → Result
─────────────────────────────────────
Upload via API       → File in temp/ ❌
                     → DB references temp/ ❌
                     → Temp cleanup may delete file ❌
Copy files to dir    → Not detected ❌
Delete DB + Restart  → Empty database ❌
```

### After (Unified Storage)
```
User Action          → Result
─────────────────────────────────────
Upload via API       → File moved to data/local/ ✅
                     → DB references data/local/ ✅
                     → Unique filename prevents collisions ✅
Copy files to dir    → Detected on next restart ✅
Delete DB + Restart  → Auto-scan & register ✅
All files in one place → workspace/data/local/ ✅
```

## Performance Considerations

- **Small datasets** (< 100 files): Negligible impact (< 1 second)
- **Large datasets** (> 1000 files): May take several seconds
- **Metadata extraction**: GeoJSON files are fast; Shapefiles may be slower
- **One-time cost**: Only runs on startup, not during normal operation

## Troubleshooting

### Files Not Registered

**Check**:
1. File is in correct directory: `workspace/data/local/`
2. File extension is supported
3. File is valid (not corrupted)
4. Server logs show any errors during registration

**Solution**:
```bash
# Check server logs for errors
# Verify file exists
ls workspace/data/local/

# Manually test upload
curl -X POST http://localhost:3000/api/upload/single \
  -F "file=@workspace/data/local/your-file.geojson"
```

### Duplicate Registrations

**Should not happen** - the system checks existing paths before registering.

If duplicates occur:
```sql
-- Check for duplicates
SELECT reference, COUNT(*) 
FROM data_sources 
GROUP BY reference 
HAVING COUNT(*) > 1;

-- Remove duplicates (keep newest)
DELETE FROM data_sources 
WHERE id NOT IN (
  SELECT MAX(id) 
  FROM data_sources 
  GROUP BY reference
);
```

### Metadata Missing

If files show "N/A records" in Chat view:

**Cause**: File was registered without going through FileUploadService (e.g., direct database manipulation)

**Solution**:
1. Delete the data source from database
2. Re-upload via API or restart server (auto-scan will use FileUploadService)
3. File will be properly processed with metadata extraction

## Future Enhancements

Potential improvements:
- [ ] Watch directory for changes (hot reload)
- [ ] Periodic background scan (every hour)
- [ ] Admin endpoint to trigger manual scan
- [ ] Progress bar for large directories
- [ ] Configurable scan interval
- [ ] Exclude patterns (e.g., ignore temp files)
