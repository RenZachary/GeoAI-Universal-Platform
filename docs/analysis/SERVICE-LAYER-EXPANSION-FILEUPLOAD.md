# Service Layer Expansion - FileUploadService Implementation

## Date: 2026-05-04

---

## Executive Summary

From an architect's perspective, I've expanded the service layer by implementing **FileUploadService**, demonstrating the scalability and reusability of the established architectural pattern. This service extracts complex file processing logic from FileUploadController, including format detection, validation, metadata extraction, and error handling with automatic cleanup.

**Status**: ✅ **FileUploadService Complete**  
**Impact**: Complex file upload logic isolated from HTTP layer  
**Progress**: Service layer architecture proven scalable (2 services implemented)

---

## What Was Implemented

### 1. ✅ FileUploadService (359 lines)

**File**: `server/src/services/FileUploadService.ts`

#### Service Responsibilities

```typescript
export class FileUploadService {
  constructor(
    private dataSourceRepo: DataSourceRepository,
    workspaceBase?: string
  ) {}
  
  // Public API - File Upload Operations
  async processSingleFile(file: UploadedFile): Promise<UploadResult>
  async processShapefile(files: UploadedFile[]): Promise<UploadResult>
  getUploadDir(): string
  
  // Private Helpers - Business Logic
  private detectDataSourceType(fileName: string): DataSourceType
  private async validateFile(filePath: string, type: DataSourceType): Promise<void>
  private async extractMetadata(filePath: string, type: DataSourceType): Promise<NativeData>
  private async validateShapefileComplete(shpPath: string): Promise<void>
  private validateShapefileComponents(files: UploadedFile[]): ShapefileComponents
  private cleanupFile(filePath: string): void
}
```

#### Key Design Decisions

**1. Automatic File Cleanup on Error**
```typescript
async processSingleFile(file: UploadedFile): Promise<UploadResult> {
  try {
    // Process file...
    return result;
  } catch (error) {
    this.cleanupFile(filePath); // ✅ Automatic cleanup
    throw error;
  }
}
```

**Rationale**: 
- Prevents disk space waste from failed uploads
- Ensures filesystem consistency
- Transparent to controller layer

**2. Type Detection from Extension**
```typescript
private detectDataSourceType(fileName: string): DataSourceType {
  const ext = path.extname(fileName).toLowerCase();
  
  switch (ext) {
    case '.geojson': return 'geojson';
    case '.shp': return 'shapefile';
    case '.tif': return 'tif';
    default: throw new FormatError(`Unsupported format: ${ext}`);
  }
}
```

**Rationale**:
- Centralized format detection logic
- Easy to extend with new formats
- Clear error messages for unsupported types

**3. Shapefile Component Validation**
```typescript
private validateShapefileComponents(files: UploadedFile[]): ShapefileComponents {
  const components: ShapefileComponents = { shp: '' };
  
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    switch (ext) {
      case '.shp': components.shp = file.path; break;
      case '.shx': components.shx = file.path; break;
      case '.dbf': components.dbf = file.path; break;
      case '.prj': components.prj = file.path; break;
    }
  }
  
  if (!components.shp) {
    throw new ValidationError('Shapefile upload must include .shp file');
  }
  
  return components;
}
```

**Rationale**:
- Validates completeness before processing
- Organizes components by type
- Provides clear validation errors

**4. Metadata Extraction via Accessors**
```typescript
private async extractMetadata(filePath: string, type: DataSourceType): Promise<NativeData> {
  const accessor = this.accessorFactory.createAccessor(type);
  const nativeData = await accessor.read(filePath);
  return nativeData;
}
```

**Rationale**:
- Reuses existing DataAccessor infrastructure
- Consistent metadata extraction across all formats
- Leverages format-specific validation in accessors

---

### 2. ✅ Custom Error Classes

```typescript
export class FileUploadError extends Error {
  constructor(message: string, public code: string = 'FILE_UPLOAD_ERROR') { ... }
}

export class ValidationError extends FileUploadError { ... }
export class FormatError extends FileUploadError { ... }
```

**Benefits**:
- Type-safe error handling in controllers
- Precise HTTP status code mapping
- Clear error categorization

---

### 3. ✅ Type Definitions

```typescript
export interface UploadedFile {
  originalname: string;
  filename: string;
  path: string;
  size: number;
  mimetype: string;
}

export interface UploadResult {
  id: string;
  name: string;
  type: DataSourceType;
  size: number;
  metadata: any;
  uploadedAt: Date;
}

export interface ShapefileComponents {
  shp: string;
  shx?: string;
  dbf?: string;
  prj?: string;
}
```

**Benefits**:
- Explicit contracts between layers
- TypeScript enforces type safety
- Self-documenting API

---

## Architecture Pattern Validation

This implementation validates that the service layer pattern established with DataSourceService is **scalable and reusable**:

### Consistent Pattern Applied

| Aspect | DataSourceService | FileUploadService | Pattern Validated? |
|--------|------------------|-------------------|-------------------|
| **Constructor Injection** | ✅ Repository injected | ✅ Repository injected | ✅ Yes |
| **Custom Errors** | ✅ ConnectionError, ValidationError | ✅ ValidationError, FormatError | ✅ Yes |
| **Type Definitions** | ✅ Config, Result interfaces | ✅ UploadedFile, UploadResult | ✅ Yes |
| **Public API** | ✅ Clear business methods | ✅ processSingleFile, processShapefile | ✅ Yes |
| **Private Helpers** | ✅ validateConfig, testConnection | ✅ detectType, validateFile | ✅ Yes |
| **Error Cleanup** | N/A | ✅ Automatic file cleanup | ✅ Enhanced |

### Reusability Demonstrated

The same architectural patterns work for different domains:
- **DataSourceService**: Database connection management
- **FileUploadService**: File processing and registration

This proves the pattern is **domain-agnostic** and can be applied to:
- ChatService (LLM workflow orchestration)
- ToolService (Plugin management)
- PromptTemplateService (Template CRUD)

---

## Files Created/Modified

### New Files (1)

1. **`server/src/services/FileUploadService.ts`** (359 lines)
   - Complete file upload business logic
   - Format detection and validation
   - Metadata extraction
   - Automatic cleanup on error

### Modified Files (1)

1. **`server/src/services/index.ts`** (+3 lines)
   - Added FileUploadService export
   - Added type exports

**Total**: +362 lines of production code

---

## Comparison: Controller vs Service

### Before Refactoring (Controller handles everything)

```typescript
// FileUploadController.ts (CURRENT - 458 lines)
class FileUploadController {
  private db: Database.Database;
  private dataSourceRepo: DataSourceRepository;
  private accessorFactory: DataAccessorFactory;
  
  constructor(db: Database.Database) {
    this.db = db;
    this.dataSourceRepo = new DataSourceRepository(db);
    this.accessorFactory = new DataAccessorFactory();
  }
  
  async uploadSingleFile(req, res) {
    // ~100 lines mixing:
    // - HTTP parsing (req.file)
    // - Format detection (path.extname)
    // - Validation (accessor.read)
    // - Metadata extraction
    // - Database registration
    // - Error handling with cleanup
    
    const ext = path.extname(fileName).toLowerCase();
    let type: DataSourceType;
    switch (ext) { /* ... */ }
    
    const accessor = this.accessorFactory.createAccessor(type);
    const nativeData = await accessor.read(filePath);
    
    this.dataSourceRepo.create(...); // Direct DB call
    
    res.json({ success: true, ... });
  }
}
```

**Problems**:
- ❌ Mixed HTTP + business logic
- ❌ Direct database access
- ❌ Untestable without full stack
- ❌ Code duplication (format detection in multiple places)

---

### After Refactoring (Clean separation)

```typescript
// FileUploadService.ts (Business logic only)
class FileUploadService {
  constructor(private repo: DataSourceRepository) {}
  
  async processSingleFile(file: UploadedFile): Promise<UploadResult> {
    const type = this.detectDataSourceType(file.originalname);
    await this.validateFile(file.path, type);
    const nativeData = await this.extractMetadata(file.path, type);
    return this.registerDataSource(file, type, nativeData);
  }
}

// FileUploadController.ts (HTTP only - TO BE REFACTORED)
class FileUploadController {
  constructor(private service: FileUploadService) {}
  
  async uploadSingleFile(req, res) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }
      
      const result = await this.service.processSingleFile(req.file);
      
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }
}
```

**Benefits**:
- ✅ Separated concerns
- ✅ Testable service layer
- ✅ Reusable business logic
- ✅ Consistent error handling

---

## Testing Strategy

### Unit Testing Service (No HTTP, No DB)

```typescript
describe('FileUploadService', () => {
  let service: FileUploadService;
  let mockRepo: MockDataSourceRepository;
  
  beforeEach(() => {
    mockRepo = new MockDataSourceRepository();
    service = new FileUploadService(mockRepo);
  });
  
  it('should detect GeoJSON format', () => {
    const type = service['detectDataSourceType']('data.geojson');
    expect(type).toBe('geojson');
  });
  
  it('should reject unsupported format', () => {
    expect(() => {
      service['detectDataSourceType']('data.xml');
    }).toThrow(FormatError);
  });
  
  it('should validate shapefile components', () => {
    const files = [
      { originalname: 'rivers.shp', path: '/tmp/rivers.shp' },
      { originalname: 'rivers.shx', path: '/tmp/rivers.shx' },
      { originalname: 'rivers.dbf', path: '/tmp/rivers.dbf' }
    ] as UploadedFile[];
    
    const components = service['validateShapefileComponents'](files);
    
    expect(components.shp).toBeDefined();
    expect(components.shx).toBeDefined();
    expect(components.dbf).toBeDefined();
  });
  
  it('should cleanup file on error', async () => {
    const mockFile = {
      originalname: 'test.geojson',
      path: '/tmp/test.geojson',
      size: 1024,
      filename: 'test.geojson',
      mimetype: 'application/json'
    };
    
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'unlinkSync').mockImplementation();
    
    await expect(service.processSingleFile(mockFile)).rejects.toThrow();
    
    expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/test.geojson');
  });
});
```

---

## Next Steps

### Immediate: Refactor FileUploadController

**Tasks**:
1. Inject FileUploadService into controller
2. Remove all business logic from controller methods
3. Keep only HTTP handling (multer middleware, response formatting)
4. Add unified error handler
5. Reduce controller from 458 to ~150 lines

**Estimated Effort**: 2-3 hours

**Expected Outcome**:
```typescript
class FileUploadController {
  constructor(private service: FileUploadService) {}
  
  async uploadSingleFile(req, res) {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }
    
    const result = await this.service.processSingleFile(req.file);
    res.status(201).json({ success: true, data: result });
  }
}
```

---

### Future: Apply Pattern to Remaining Controllers

**Priority Order**:
1. ✅ DataSourceController → DataSourceService (COMPLETE)
2. ⏳ FileUploadController → FileUploadService (Service ready, controller pending)
3. 🔜 ChatController → ChatService
4. 🔜 ToolController → ToolService
5. 🔜 PromptTemplateController → PromptTemplateService

---

## Benefits Achieved

### Immediate Benefits

✅ **Business Logic Isolated**: File processing separated from HTTP  
✅ **Automatic Cleanup**: Failed uploads don't waste disk space  
✅ **Type Safety**: Explicit interfaces for file operations  
✅ **Reusable**: Service usable by HTTP, CLI, background jobs  
✅ **Testable**: Can unit test without multer or database  

### Architectural Validation

✅ **Pattern Scalability**: Works for different domains (DB connections, file uploads)  
✅ **Consistency**: Same structure across services  
✅ **Extensibility**: Easy to add new file formats  
✅ **Maintainability**: Changes localized to service layer  

---

## Metrics

| Metric | Value |
|--------|-------|
| **Service Lines** | 359 |
| **Type Definitions** | 3 interfaces |
| **Custom Errors** | 3 classes |
| **Public Methods** | 3 (processSingleFile, processShapefile, getUploadDir) |
| **Private Methods** | 6 (validation, detection, cleanup) |
| **Code Coverage Potential** | 80%+ |

---

## Conclusion

The FileUploadService implementation successfully validates that the service layer architecture is **scalable, reusable, and domain-agnostic**. By applying the same patterns established with DataSourceService, we've created a clean separation between HTTP handling and file processing business logic.

**Key Achievement**: Demonstrated that the architectural pattern works across different domains, proving its viability for the entire codebase refactoring effort.

The service is now ready for:
- ✅ Unit testing without HTTP/database dependencies
- ✅ Integration into FileUploadController (pending refactoring)
- ✅ Reuse by CLI tools or background jobs
- ✅ Extension with new file formats

---

## References

- [SERVICE-LAYER-REFACTORING-COMPLETE.md](file://e:\codes\GeoAI-UP\docs\analysis\SERVICE-LAYER-REFACTORING-COMPLETE.md) - Overall refactoring summary
- [SERVICE-LAYER-IMPLEMENTATION-PHASE1.md](file://e:\codes\GeoAI-UP\docs\analysis\SERVICE-LAYER-IMPLEMENTATION-PHASE1.md) - DataSourceService implementation
- [SERVICE-LAYER-REFACTORING-PHASE2.md](file://e:\codes\GeoAI-UP\docs\analysis\SERVICE-LAYER-REFACTORING-PHASE2.md) - DataSourceController refactoring
