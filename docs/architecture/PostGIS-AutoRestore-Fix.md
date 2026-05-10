# PostGIS Integration Architecture & Auto-Restore Fix

## Problem Summary

**Error**: `No backend found for data source type: postgis`

When users tried to perform spatial operations (like buffer analysis) on PostGIS data sources, the system failed because the PostGIS backend was not configured in the `DataAccessFacade`.

## Root Cause Analysis

### Architecture Overview

The system uses a **singleton pattern** for `DataAccessFacade`:

```typescript
// Singleton - only ONE instance exists across the entire application
const facade = DataAccessFacade.getInstance(workspaceBase);
```

This facade manages multiple backends:
- **VectorBackend**: Handles GeoJSON, Shapefile
- **RasterBackend**: Handles GeoTIFF  
- **PostGISBackend**: Handles PostGIS tables (configured dynamically at runtime)

### The Lifecycle Issue

1. **Server Startup**:
   - `DataAccessFacade` singleton created WITHOUT PostGIS backend
   - Only VectorBackend and RasterBackend registered

2. **User Connects to PostGIS** (via UI):
   - Calls `DataSourceService.registerPostGISConnection(config)`
   - Inside: `this.dataAccess.configurePostGIS(config)` ✅
   - PostGISBackend added to the shared singleton's backends array

3. **Server Restart**:
   - ❌ **Problem**: PostGIS connection config is lost (in-memory only)
   - ✅ Data source records survive (persisted in SQLite)
   - Result: Data sources exist but backend not configured

4. **User Runs Operation After Restart**:
   - Operator calls `DataAccessFacade.getInstance()` → gets singleton
   - Singleton doesn't have PostGIS backend configured
   - Error: "No backend found for data source type: postgis"

### Why This Happened

**Data sources are persisted, but connection configs are NOT:**
- SQLite stores: data source ID, name, type, reference, metadata (including connection info)
- In-memory only: PostGISBackend instance in DataAccessFacade

After restart, the system knows ABOUT PostGIS data sources but can't ACCESS them.

## Solution: Auto-Restore PostGIS Connections

### Implementation

Added `restorePostGISConnections()` method in `DataSourceService` constructor:

```typescript
constructor(dataSourceRepo: DataSourceRepository, workspaceBase?: string, db?: Database.Database) {
  this.dataSourceRepo = dataSourceRepo;
  this.dataAccess = DataAccessFacade.getInstance(workspaceBase);
  this.db = db;
  
  // Restore PostGIS connections from registered data sources
  this.restorePostGISConnections();
}
```

### How It Works

1. **On Server Startup**:
   - Query SQLite for all PostGIS data sources
   - Extract unique connection configurations from metadata
   - Reconfigure each connection via `dataAccess.configurePostGIS(config)`

2. **Connection Extraction**:
   ```typescript
   // From data source metadata like:
   {
     connection: {
       host: 'localhost',
       port: 5432,
       database: 'mydb',
       user: 'postgres',
       password: 'secret',
       schema: 'public'
     }
   }
   
   // Create config and call:
   this.dataAccess.configurePostGIS(config);
   ```

3. **Result**:
   - PostGIS backend reconfigured automatically
   - Users can immediately use PostGIS data sources after restart
   - No manual reconnection needed

### Enhanced Error Messages

Added pre-flight check in operators:

```typescript
// Before attempting operation
if (dataSource.type === 'postgis') {
  const postGISBackend = dataAccess.getPostGISBackend();
  if (!postGISBackend) {
    throw new Error(
      `Data source '${dataSource.name}' is a PostGIS table, but no PostGIS connection is configured. ` +
      `Please connect to the PostGIS database first via Data Management > Connect to PostGIS.`
    );
  }
}
```

This provides clear guidance instead of cryptic "backend not found" errors.

## Debugging Improvements

Added comprehensive logging to trace the issue:

```typescript
// When singleton is accessed
[DataAccessFacade] Creating new singleton instance
[DataAccessFacade] Returning existing singleton instance

// When PostGIS is configured
[DataAccessFacade] Configuring PostGIS backend: localhost:5432/mydb
[DataAccessFacade] PostGIS backend configured. Total backends: 3

// When looking up backend
[DataAccessFacade] Looking for backend for type: postgis, reference: public.node
[DataAccessFacade] Available backends: vector, raster
[DataAccessFacade] Backend vector canHandle: false
[DataAccessFacade] Backend raster canHandle: false
```

These logs make it immediately obvious when PostGIS isn't configured.

## Security Considerations

⚠️ **Current Implementation**: Connection passwords stored in plain text in SQLite metadata

**Future Improvements**:
1. Encrypt passwords before storing
2. Use environment variables for sensitive credentials
3. Implement credential vault integration
4. Add option to require re-authentication after restart

## Testing

To verify the fix works:

1. **Connect to PostGIS**:
   - Go to Data Management > Connect to PostGIS
   - Enter connection details
   - Verify tables are discovered

2. **Restart Server**:
   - Stop and start the server
   - Check logs for: `[DataSourceService] Restoring X PostGIS connection(s)...`
   - Verify: `[DataSourceService] ✓ Connection restored: ...`

3. **Run Buffer Analysis**:
   - Select a PostGIS data source
   - Run buffer operation
   - Should work without re-connecting

## Architectural Principles

This fix follows several key principles:

1. **Separation of Concerns**: 
   - Data persistence (SQLite) separate from runtime configuration (in-memory)
   
2. **Graceful Degradation**:
   - If restoration fails, server still starts
   - User gets clear error message when trying to use unconfigured source

3. **Single Source of Truth**:
   - Connection info stored once (in data source metadata)
   - Automatically reconstructed on startup

4. **User Experience**:
   - Transparent restoration (no manual intervention needed)
   - Clear error messages when things go wrong

## Related Files Modified

1. **server/src/data-access/facade/DataAccessFacade.ts**
   - Added diagnostic logging
   - Improved error messages

2. **server/src/services/DataSourceService.ts**
   - Added `restorePostGISConnections()` method
   - Called from constructor

3. **server/src/spatial-operators/operators/BufferOperator.ts**
   - Added pre-flight check for PostGIS backend
   - Better error messages

## Future Enhancements

1. **Connection Health Checks**:
   - Periodically test restored connections
   - Auto-reconnect if connection drops

2. **Lazy Connection**:
   - Don't connect until first use
   - Reduces startup time

3. **Multiple Connections**:
   - Support multiple PostGIS databases simultaneously
   - Route operations based on data source

4. **Connection Pooling**:
   - Share connections across operations
   - Better performance

---

**Status**: ✅ Fixed
**Date**: 2026-05-10
**Impact**: Users can now use PostGIS data sources immediately after server restart without manual reconnection.
