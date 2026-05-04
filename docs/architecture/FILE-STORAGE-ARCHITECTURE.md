# File Storage Architecture - Unified Data Directory

## Overview

This document describes the unified file storage architecture where all data source files are stored in `workspace/data/local/` and the database never references temporary directories.

## Design Principles

### 1. Single Source of Truth
- **All data files** → `workspace/data/local/`
- **Database references** → Only point to `workspace/data/local/` paths
- **No temp references** → Database never stores `workspace/temp/` paths

### 2. Automatic File Management
- Upload flow automatically moves files from temp to data directory
- Unique filenames prevent collisions
- Temporary files cleaned up immediately after processing

### 3. Consistent Metadata Extraction
- All files processed through `FileUploadService`
- Same metadata extraction logic for uploads and auto-scan
- Feature count, fields, CRS always available

## Architecture

### File Upload Flow

```
┌─────────────┐
│ User Upload │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Multer Middleware│
│ Saves to temp/  │
└──────┬──────────┘
       │
       ▼
┌──────────────────────────────┐
│ FileUploadService            │
│ processSingleFile()          │
│                              │
│ 1. Detect file type          │
│ 2. Generate unique name      │
│    timestamp_originalname    │
│ 3. Copy: temp/ → data/local/ │
│ 4. Delete temp file          │
│ 5. Validate file             │
│ 6. Extract metadata          │
│ 7. Register in DB            │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Result                       │
│                              │
│ File: workspace/data/local/  │
│        1234567890_file.geojson│
│ DB: reference → data/local/  │
│ Temp: deleted                │
└──────────────────────────────┘
```

### Auto-Scan Flow (Server Startup)

```
┌──────────────────┐
│ Server Starts    │
└──────┬───────────┘
       │
       ▼
┌──────────────────────────────┐
│ scanAndRegisterDataFiles()   │
│                              │
│ 1. Scan workspace/data/local/│
│ 2. List existing DB records  │
│ 3. Find unregistered files   │
│ 4. For each new file:        │
│    - Call processSingleFile()│
│    - Extract metadata        │
│    - Register in DB          │
│ 5. Log results               │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ All files registered         │
│ with complete metadata       │
└──────────────────────────────┘
```

## Implementation

### Key Files

1. **FileUploadService** (`server/src/services/FileUploadService.ts`)
   - Handles file upload processing
   - Moves files from temp to data/local/
   - Extracts metadata
   - Registers in database

2. **DataDirectoryScanner** (`server/src/utils/DataDirectoryScanner.ts`)
   - Scans data directory on startup
   - Identifies unregistered files
   - Uses FileUploadService for registration

3. **Server Entry** (`server/src/index.ts`)
   - Calls scanAndRegisterDataFiles() during initialization
   - Ensures all files are registered before API starts

### Code Example: File Upload

```typescript
// FileUploadService.processSingleFile()
async processSingleFile(file: UploadedFile): Promise<UploadResult> {
  const originalFileName = file.originalname;
  const tempFilePath = file.path;
  
  // Step 1: Detect type
  const type = this.detectDataSourceType(originalFileName);
  
  // Step 2: Move to data/local/ with unique name
  const uniqueFileName = `${Date.now()}_${originalFileName}`;
  const finalFilePath = path.join(this.uploadDir, uniqueFileName);
  
  fs.copyFileSync(tempFilePath, finalFilePath);
  this.cleanupFile(tempFilePath); // Delete temp
  
  // Step 3: Validate & extract metadata
  await this.validateFile(finalFilePath, type);
  const nativeData = await this.extractMetadata(finalFilePath, type);
  
  // Step 4: Register in database
  const dataSource = this.dataSourceRepo.create(
    name, type, finalFilePath, // ← Points to data/local/
    { ...nativeData.metadata }
  );
  
  return result;
}
```

### Code Example: Auto-Scan

```typescript
// DataDirectoryScanner.scanAndRegisterDataFiles()
export async function scanAndRegisterDataFiles(
  db: any,
  workspaceBase: string
): Promise<void> {
  const dataDir = path.join(workspaceBase, 'data', 'local');
  
  // Get files in directory
  const files = fs.readdirSync(dataDir).filter(...);
  
  // Check which are already registered
  const existingSources = dataSourceRepo.listAll();
  const existingPaths = new Set(existingSources.map(ds => ds.reference));
  
  // Register unregistered files
  for (const file of files) {
    const fullPath = path.join(dataDir, file);
    
    if (!existingPaths.has(fullPath)) {
      // Use FileUploadService for consistent processing
      await fileUploadService.processSingleFile({
        originalname: file,
        filename: file,
        path: fullPath, // ← Already in data/local/
        size: fs.statSync(fullPath).size,
        mimetype: 'application/octet-stream'
      });
    }
  }
}
```

## Benefits

### ✅ Consistency
- All files in one location: `workspace/data/local/`
- Database references are stable and predictable
- No confusion about where files are stored

### ✅ Reliability
- Temporary files cleaned up immediately
- No risk of temp cleanup deleting active data sources
- Unique filenames prevent overwrites

### ✅ Maintainability
- Single code path for file processing (FileUploadService)
- Easy to backup: just copy `workspace/data/local/`
- Easy to migrate: move one directory

### ✅ User Experience
- Files uploaded via API work correctly
- Files placed in directory detected on restart
- Chat page shows correct record counts (metadata extracted)

## Directory Structure

```
workspace/
├── data/
│   └── local/                    ← All data source files
│       ├── 1234567890_world.geojson
│       ├── 1234567891_世界.geojson
│       ├── 1234567892_china-boundary.geojson
│       └── ...
├── database/
│   └── geoai-up.db              ← References data/local/ paths
├── temp/                        ← Temporary only, cleaned up
│   └── (empty or transient files)
└── results/                     ← Generated outputs
    ├── geojson/
    ├── mvt/
    └── ...
```

## Migration Notes

### From Old System

If you have an old system where database references point to `temp/`:

1. **Stop server**
2. **Backup database**: `cp workspace/database/geoai-up.db workspace/database/geoai-up.db.backup`
3. **Delete database**: `rm workspace/database/geoai-up.db`
4. **Ensure files exist**: Check that your data files are in `workspace/data/local/`
5. **Restart server**: Auto-scan will re-register all files with correct paths

### Verification

After migration, verify:

```sql
-- All references should point to data/local/
SELECT id, name, reference 
FROM data_sources 
WHERE reference NOT LIKE '%data/local%';

-- Should return 0 rows
```

## Troubleshooting

### Files Not Showing in UI

**Check**:
1. File exists in `workspace/data/local/`
2. Database has record pointing to that file
3. Metadata was extracted (featureCount not null)

**Fix**:
```bash
# Restart server to trigger auto-scan
# Or manually re-upload the file
```

### Duplicate Files

**Should not happen** - unique filenames with timestamp prefix prevent this.

If duplicates occur:
```sql
-- Find duplicates by original filename
SELECT originalFileName, COUNT(*) 
FROM data_sources 
GROUP BY originalFileName 
HAVING COUNT(*) > 1;
```

### Missing Metadata

**Cause**: File registered without going through FileUploadService

**Fix**:
1. Delete the data source record
2. Restart server (auto-scan will re-process)
3. Or re-upload via API

## Future Enhancements

Potential improvements:
- [ ] File deduplication (hash-based)
- [ ] Compression for large files
- [ ] Organize into subdirectories by type/date
- [ ] File integrity verification
- [ ] Backup/restore functionality
- [ ] Disk usage monitoring
