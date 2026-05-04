# Fix: Auto-Scan File Duplication Issue

## Problem

After restarting the server, files in `workspace/data/local/` were being duplicated with timestamp prefixes:

```
Original file:     世界.geojson
After 1st restart: 1746345678901_世界.geojson (created)
After 2nd restart: 1746345679999_世界.geojson (created again!)
                   1746345678901_世界.geojson (still exists)
                   世界.geojson (original still exists)
```

**Result**: Multiple copies of the same file, database pointing to different versions.

## Root Cause

The auto-scan function was using `FileUploadService.processSingleFile()` which:

1. **Always adds timestamp prefix**: `${Date.now()}_${originalFileName}`
2. **Copies file** from source to destination
3. **Designed for uploads** from temp directory, not for existing files

### The Bug Flow

```
Startup Scan:
  1. Find: 世界.geojson
  2. Call: processSingleFile({ path: "世界.geojson" })
  3. Inside processSingleFile():
     - Generate: "1746345678901_世界.geojson"
     - Copy: 世界.geojson → 1746345678901_世界.geojson
     - Register: DB points to 1746345678901_世界.geojson
  4. Original file "世界.geojson" still exists but NOT registered

Next Startup:
  1. Find: 世界.geojson (original, unregistered)
  2. Find: 1746345678901_世界.geojson (already registered)
  3. Check: existingPaths.has("世界.geojson") → FALSE ❌
  4. Repeat step 2-3 above with NEW timestamp
  5. Result: Another duplicate created!
```

## Solution

Created a dedicated registration flow for existing files that:

1. ✅ **Does NOT copy files** - uses original path
2. ✅ **Does NOT rename files** - no timestamp prefix
3. ✅ **Directly extracts metadata** using DataAccessor
4. ✅ **Registers with original path** in database

### Implementation

**File**: `server/src/utils/DataDirectoryScanner.ts`

**Before** (using FileUploadService):
```typescript
await fileUploadService.processSingleFile({
  originalname: file,
  filename: file,
  path: fullPath,
  size: fs.statSync(fullPath).size,
  mimetype: 'application/octet-stream'
});
// ↑ This copies and renames the file!
```

**After** (direct registration):
```typescript
// Detect file type
const type = detectFileType(file);

// Get accessor for this type
const accessor = accessorFactory.createAccessor(type);

// Extract metadata directly from the file (no copying)
const metadata = await accessor.getMetadata(fullPath);

// Register in database with the original path
dataSourceRepo.create(
  path.basename(file, path.extname(file)),
  type,
  fullPath, // ← Use original path, no renaming
  {
    ...metadata,
    originalFileName: file,
    fileSize: metadata.fileSize,
    uploadedAt: new Date().toISOString()
  }
);
```

## Key Differences

| Aspect | FileUploadService | Direct Registration |
|--------|------------------|---------------------|
| **Use Case** | New uploads from temp dir | Existing files in data/local/ |
| **File Copying** | Yes (temp → data/local/) | No (file stays in place) |
| **Renaming** | Yes (timestamp prefix) | No (original name preserved) |
| **DB Reference** | Points to renamed file | Points to original file |
| **Idempotent** | No (creates duplicates) | Yes (skips registered files) |

## Testing

### Before Fix
```bash
# Initial state
workspace/data/local/
├── 世界.geojson

# After 1st restart
workspace/data/local/
├── 世界.geojson
└── 1746345678901_世界.geojson  ← Duplicate created

# After 2nd restart
workspace/data/local/
├── 世界.geojson
├── 1746345678901_世界.geojson
└── 1746345679999_世界.geojson  ← Another duplicate!
```

### After Fix
```bash
# Initial state
workspace/data/local/
├── 世界.geojson

# After 1st restart
workspace/data/local/
└── 世界.geojson  ← No duplication
Database: reference = ".../data/local/世界.geojson"

# After 2nd restart
workspace/data/local/
└── 世界.geojson  ← Still just one file
Database: Same record (skipped as already registered)

# After 3rd, 4th, Nth restart
workspace/data/local/
└── 世界.geojson  ← Never duplicated
```

## Verification Steps

1. **Clean up duplicates** (if any exist):
   ```bash
   # List all files
   ls workspace/data/local/
   
   # Manually remove timestamped duplicates
   rm workspace/data/local/*_*.geojson  # Be careful!
   ```

2. **Restart server**:
   ```bash
   # Should see clean output
   Scanning data directory for existing files...
     Found 10 files in data directory
       Registering: 世界.geojson
       ✓ Registered: 世界.geojson (geojson)
       ...
     Registration complete: 10 new, 0 already registered
   ```

3. **Restart again** (verify idempotency):
   ```bash
   Scanning data directory for existing files...
     Found 10 files in data directory
     Registration complete: 0 new, 10 already registered
   ```

4. **Check database**:
   ```sql
   SELECT id, name, reference 
   FROM data_sources 
   WHERE reference LIKE '%data/local%';
   
   -- All references should point to original filenames
   -- No timestamp prefixes like "1746345678901_"
   ```

## Impact

✅ **No more file duplication**  
✅ **Database references are stable**  
✅ **Original filenames preserved**  
✅ **Idempotent startup scans**  
✅ **Faster startup** (no file copying overhead)  

## Related Files

- [`server/src/utils/DataDirectoryScanner.ts`](file://e:\codes\GeoAI-UP\server\src\utils\DataDirectoryScanner.ts) - Fixed implementation
- [`server/src/services/FileUploadService.ts`](file://e:\codes\GeoAI-UP\server\src\services\FileUploadService.ts) - Still used for API uploads (correct behavior)
- [`server/src/index.ts`](file://e:\codes\GeoAI-UP\server\src\index.ts) - Calls scanAndRegisterDataFiles on startup
