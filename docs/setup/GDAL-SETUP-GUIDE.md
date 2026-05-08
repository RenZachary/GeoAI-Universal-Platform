# GDAL Setup Guide for GeoAI-UP

## Overview

GeoAI-UP uses GDAL (Geospatial Data Abstraction Library) for advanced raster data processing, particularly for serving GeoTIFF files via WMS (Web Map Service).

## Why GDAL?

GDAL provides high-performance raster processing capabilities including:
- Coordinate system transformations
- Image warping and resampling
- Tile rendering for web maps
- Support for hundreds of raster formats

## Installation Options

### Option 1: Use Pre-built GDAL Binaries (Recommended for Windows)

1. **Download GDAL**
   - Visit: https://github.com/OSGeo/gdal/releases
   - Download the latest Windows release (e.g., `release-1900-x64-gdal-3-8-5-mapserver-7-6-4.zip`)
   - Or use GISInternals builds: https://www.gisinternals.com/release.php

2. **Extract to Vendor Directory**
   ```
   Extract GDAL to: vendor/GDAL/
   
   Expected structure:
   vendor/GDAL/
   ├── bin/
   │   ├── gdalinfo.exe
   │   ├── gdalwarp.exe
   │   ├── gdal_translate.exe
   │   └── ... (other GDAL executables)
   ├── data/
   ├── lib/
   └── ...
   ```

3. **Verify Installation**
   ```bash
   # Test from command line
   vendor\GDAL\bin\gdalinfo --version
   ```

### Option 2: Install GDAL System-Wide

1. **Using OSGeo4W Installer**
   - Download: https://download.osgeo.org/osgeo4w/osgeo4w-setup.exe
   - Select "Express Desktop Install" or choose GDAL packages manually
   - This adds GDAL to your system PATH

2. **Using Conda**
   ```bash
   conda install -c conda-forge gdal
   ```

3. **Verify Installation**
   ```bash
   gdalinfo --version
   ```

## Configuration

### For Development

Set the `GDAL_DIR` environment variable in `server/.env`:

```env
# Path to GDAL installation directory
GDAL_DIR=./vendor/GDAL
```

Or set it as a system environment variable:
```powershell
# PowerShell
$env:GDAL_DIR = "C:\path\to\GDAL"

# Or permanently
[Environment]::SetEnvironmentVariable("GDAL_DIR", "C:\path\to\GDAL", "User")
```

### For Packaged Distribution

The packaging script (`package.js`) automatically:
1. Copies `vendor/GDAL` to the package root directory
2. Sets `GDAL_DIR` in `start.bat` to point to the bundled GDAL

No additional configuration needed for end users!

## Testing GDAL Integration

After setting up GDAL, test it with:

```bash
# Start the server
npm run dev:server

# Upload a GeoTIFF file through the web interface
# The system should be able to:
# - Extract metadata (extent, CRS, resolution)
# - Serve tiles via WMS
# - Display on the map
```

## Troubleshooting

### Error: "GDAL executable not found"

**Solution:**
1. Verify GDAL binaries exist in the expected location
2. Check that `GDAL_DIR` environment variable is set correctly
3. Ensure the path doesn't contain spaces (or use quotes)
4. Try running `gdalinfo.exe` directly from the bin directory

### Error: "DLL load failed" or missing dependencies

**Solution:**
1. Make sure all GDAL DLLs are in the same directory as executables
2. Install Visual C++ Redistributable packages
3. Check that you're using the correct architecture (x64 vs x86)

### Performance Issues

**Tips:**
1. Use SSD storage for GeoTIFF files
2. Enable tile caching in the application
3. Consider using lower resolution overviews for large files
4. Adjust resampling method based on use case (nearest for categorical, bilinear for continuous)

## Alternative: Using geotiff.js

If GDAL setup is too complex, the application can fall back to `geotiff.js` for basic operations:
- ✅ Pure JavaScript, no system dependencies
- ✅ Works out of the box
- ⚠️ Slower for large files
- ⚠️ Limited coordinate transformation support

To use geotiff.js only, simply don't set `GDAL_DIR` and the system will use the JavaScript implementation.

## License Notes

GDAL is licensed under the MIT/X-Inspired license, which is compatible with GeoAI-UP's licensing. See:
- GDAL License: https://gdal.org/license.html
- Included in LICENSE.md

## Resources

- [GDAL Documentation](https://gdal.org/)
- [GDAL Command Line Utilities](https://gdal.org/programs/index.html)
- [GISInternals Builds](https://www.gisinternals.com/)
- [OSGeo4W Installer](https://download.osgeo.org/osgeo4w/)
