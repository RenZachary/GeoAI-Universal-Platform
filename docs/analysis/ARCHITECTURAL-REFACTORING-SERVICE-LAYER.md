# Architectural Refactoring Plan: Service Layer Introduction

## Date: 2026-05-04

---

## Problem Statement

The current architecture violates **Separation of Concerns** by having controllers directly access databases through repositories. This creates:

1. **Tight Coupling**: Controllers depend on both Express AND database implementation
2. **Code Duplication**: Repository instantiation repeated across controllers
3. **Testing Difficulty**: Cannot unit test business logic without mocking database
4. **Maintenance Burden**: Changes to data access require updating multiple controllers
5. **Violation of Single Responsibility**: Controllers handle HTTP + business logic + data access

---

## Current Architecture Issues

### Example: DataSourceController

```typescript
export class DataSourceController {
  private db: Database.Database;  // ❌ Direct DB dependency
  private dataSourceRepo: DataSourceRepository;  // ❌ Direct repo instantiation

  constructor(db: Database.Database) {
    this.db = db;
    this.dataSourceRepo = new DataSourceRepository(db);  // ❌ Creates own repo
  }

  async listDataSources(req: Request, res: Response): Promise<void> {
    const sources = this.dataSourceRepo.listAll();  // ❌ Business logic in controller
    res.json({ success: true, dataSources: sources });
  }

  async registerPostGISConnection(req: Request, res: Response): Promise<void> {
    // 177 lines of business logic mixed with HTTP handling
    // - Connection testing
    // - Table discovery
    // - Schema extraction
    // - Data source registration
    // All in controller! ❌
  }
}
```

### Problems Identified

| Issue | Impact | Severity |
|-------|--------|----------|
| Controllers instantiate repositories | Tight coupling, no reuse | 🔴 High |
| Business logic in controllers | Untestable, unmaintainable | 🔴 High |
| Database connection passed everywhere | Leaky abstraction | 🟡 Medium |
| No service layer abstraction | Code duplication | 🟡 Medium |
| Mixed responsibilities | Violates SRP | 🔴 High |

---

## Proposed Solution: Service Layer Pattern

### Architecture Overview

```
Request Flow:
HTTP Request → Route → Controller → Service → Repository → Database
                          ↓
                    Response Formatting
```

### Layer Responsibilities

#### 1. **Routes** (`api/routes/index.ts`)
- URL path definition
- HTTP method mapping
- Middleware application
- **No business logic**

#### 2. **Controllers** (`api/controllers/*`)
- HTTP request parsing
- Input validation (Zod/Joi)
- Call appropriate service method
- Format HTTP response
- Error handling (HTTP status codes)
- **No business logic, no direct DB access**

#### 3. **Services** (`services/*`) ← **NEW LAYER**
- Business logic orchestration
- Transaction management
- Cross-repository operations
- Domain validation
- Event publishing
- **No HTTP knowledge, no response formatting**

#### 4. **Repositories** (`data-access/repositories/*`)
- CRUD operations
- Query building
- Data mapping (DB rows → domain objects)
- **No business logic**

#### 5. **Domain Models** (`domain/*`) ← **FUTURE**
- Business entities
- Validation rules
- Business methods
- **Pure TypeScript, no dependencies**

---

## Implementation Plan

### Phase 1: Create Service Layer Foundation (2-3 hours)

#### 1.1 Create Service Directory Structure

```
server/src/
├── services/
│   ├── index.ts              # Barrel exports
│   ├── DataSourceService.ts  # Data source management
│   ├── FileUploadService.ts  # File upload & registration
│   ├── ChatService.ts        # Chat workflow orchestration
│   ├── ToolService.ts        # Plugin tool management
│   └── PromptTemplateService.ts  # Prompt template management
```

#### 1.2 Define BaseService Interface

```typescript
// server/src/services/BaseService.ts
export interface BaseService {
  /**
   * Initialize service resources
   */
  initialize(): Promise<void>;
  
  /**
   * Cleanup service resources
   */
  destroy(): Promise<void>;
}
```

---

### Phase 2: Implement DataSourceService (3-4 hours)

#### Before (Controller handles everything):

```typescript
// DataSourceController.ts (CURRENT - BAD)
async registerPostGISConnection(req: Request, res: Response): Promise<void> {
  // 177 lines of mixed HTTP + business logic
  const { host, port, database, user, password } = req.body;
  
  // Validation
  if (!host || !database) { /* ... */ }
  
  // Business logic
  const factory = new DataAccessorFactory();
  factory.configurePostGIS({ host, port, database, user, password });
  const accessor = factory.createAccessor('postgis');
  const isConnected = await accessor.testConnection();
  
  // More business logic...
  const tables = await this.discoverPostGISTables(accessor, schema);
  
  // Data access
  for (const table of tables) {
    this.dataSourceRepo.create(/* ... */);
  }
  
  // Response formatting
  res.json({ success: true, dataSources: registeredSources });
}
```

#### After (Clean separation):

```typescript
// DataSourceService.ts (NEW - GOOD)
export class DataSourceService implements BaseService {
  private dataSourceRepo: DataSourceRepository;
  private accessorFactory: DataAccessorFactory;

  constructor(dataSourceRepo: DataSourceRepository) {
    this.dataSourceRepo = dataSourceRepo;
    this.accessorFactory = new DataAccessorFactory();
  }

  /**
   * Register PostGIS connection and discover tables
   * @returns Registered data sources with metadata
   */
  async registerPostGISConnection(config: PostGISConnectionConfig): Promise<{
    connectionInfo: ConnectionInfo;
    dataSources: RegisteredDataSource[];
  }> {
    // 1. Validate configuration
    this.validatePostGISConfig(config);
    
    // 2. Test connection
    await this.testConnection(config);
    
    // 3. Discover spatial tables
    const tables = await this.discoverSpatialTables(config);
    
    // 4. Register each table as data source
    const registeredSources = await Promise.all(
      tables.map(table => this.registerTableAsDataSource(table, config))
    );
    
    return {
      connectionInfo: {
        host: config.host,
        database: config.database,
        tableCount: registeredSources.length
      },
      dataSources: registeredSources
    };
  }

  /**
   * List all available data sources
   */
  async listDataSources(): Promise<DataSourceRecord[]> {
    return this.dataSourceRepo.listAll();
  }

  /**
   * Get data source by ID with full schema
   */
  async getDataSourceWithSchema(id: string): Promise<DataSourceWithSchema> {
    const dataSource = this.dataSourceRepo.getById(id);
    if (!dataSource) {
      throw new NotFoundError(`Data source not found: ${id}`);
    }
    
    const schema = await this.extractSchema(dataSource);
    return { ...dataSource, schema };
  }

  // Private helper methods (business logic only)
  private validatePostGISConfig(config: PostGISConnectionConfig): void {
    if (!config.host || !config.database) {
      throw new ValidationError('Missing required fields');
    }
  }

  private async testConnection(config: PostGISConnectionConfig): Promise<void> {
    // Connection testing logic
  }

  private async discoverSpatialTables(config: PostGISConnectionConfig): Promise<TableInfo[]> {
    // Table discovery logic
  }

  private async registerTableAsDataSource(
    table: TableInfo, 
    config: PostGISConnectionConfig
  ): Promise<RegisteredDataSource> {
    // Registration logic
  }

  private async extractSchema(dataSource: DataSourceRecord): Promise<SchemaInfo> {
    // Schema extraction logic
  }
}
```

```typescript
// DataSourceController.ts (REFACTORED - GOOD)
export class DataSourceController {
  private dataSourceService: DataSourceService;

  constructor(dataSourceService: DataSourceService) {
    this.dataSourceService = dataSourceService;  // ✅ Injected service
  }

  async listDataSources(req: Request, res: Response): Promise<void> {
    try {
      // ✅ Only HTTP handling
      const dataSources = await this.dataSourceService.listDataSources();
      
      res.json({
        success: true,
        count: dataSources.length,
        dataSources
      });
    } catch (error) {
      this.handleControllerError(res, error);
    }
  }

  async registerPostGISConnection(req: Request, res: Response): Promise<void> {
    try {
      // ✅ Input validation only
      const config = PostGISConnectionSchema.parse(req.body);
      
      // ✅ Delegate to service
      const result = await this.dataSourceService.registerPostGISConnection(config);
      
      // ✅ Format response
      res.status(201).json({
        success: true,
        message: `Successfully registered ${result.dataSources.length} tables`,
        ...result
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      } else {
        this.handleControllerError(res, error);
      }
    }
  }

  // ✅ Reusable error handler
  private handleControllerError(res: Response, error: unknown): void {
    console.error('[DataSourceController] Error:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ success: false, error: error.message });
    } else if (error instanceof NotFoundError) {
      res.status(404).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
```

---

### Phase 3: Dependency Injection Container (2-3 hours)

Create a simple DI container to manage service lifecycle:

```typescript
// server/src/di/Container.ts
export class Container {
  private static instance: Container;
  private services: Map<string, any> = new Map();

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  register<T>(key: string, factory: () => T): void {
    this.services.set(key, factory());
  }

  resolve<T>(key: string): T {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service not found: ${key}`);
    }
    return service;
  }
}

// server/src/di/index.ts
import { Container } from './Container';
import { DataSourceRepository } from '../data-access/repositories';
import { DataSourceService } from '../services/DataSourceService';

export function initializeDI(db: Database.Database): Container {
  const container = Container.getInstance();
  
  // Register repositories
  container.register('dataSourceRepo', () => new DataSourceRepository(db));
  
  // Register services (with dependencies)
  container.register('dataSourceService', () => 
    new DataSourceService(container.resolve('dataSourceRepo'))
  );
  
  return container;
}
```

---

### Phase 4: Update All Controllers (4-6 hours)

Refactor each controller to use services:

#### Controllers to Refactor:

1. **DataSourceController** → Uses `DataSourceService`
2. **FileUploadController** → Uses `FileUploadService`
3. **ChatController** → Uses `ChatService`
4. **ToolController** → Uses `ToolService`
5. **PromptTemplateController** → Uses `PromptTemplateService`

#### Refactoring Pattern:

```typescript
// BEFORE
export class SomeController {
  private db: Database.Database;
  private repo: SomeRepository;
  
  constructor(db: Database.Database) {
    this.db = db;
    this.repo = new SomeRepository(db);
  }
  
  async someMethod(req: Request, res: Response) {
    // Business logic here...
    const result = this.repo.doSomething();
    res.json(result);
  }
}

// AFTER
export class SomeController {
  private someService: SomeService;
  
  constructor(someService: SomeService) {
    this.someService = someService;  // Injected
  }
  
  async someMethod(req: Request, res: Response) {
    const input = SomeSchema.parse(req.body);
    const result = await this.someService.doSomething(input);
    res.json({ success: true, data: result });
  }
}
```

---

### Phase 5: Update Route Initialization (1 hour)

Update `api/routes/index.ts` to use DI container:

```typescript
// BEFORE
export class ApiRouter {
  private dataSourceController: DataSourceController;
  
  constructor(db: Database.Database) {
    this.dataSourceController = new DataSourceController(db);
  }
}

// AFTER
export class ApiRouter {
  private dataSourceController: DataSourceController;
  
  constructor(container: Container) {
    this.dataSourceController = new DataSourceController(
      container.resolve('dataSourceService')
    );
  }
}
```

---

## Benefits of This Refactoring

### 1. **Testability**
```typescript
// Can now unit test services without HTTP or DB
describe('DataSourceService', () => {
  it('should register PostGIS connection', async () => {
    const mockRepo = new MockDataSourceRepository();
    const service = new DataSourceService(mockRepo);
    
    const result = await service.registerPostGISConnection(validConfig);
    
    expect(result.dataSources).toHaveLength(3);
  });
});
```

### 2. **Reusability**
```typescript
// Services can be used by multiple controllers or background jobs
const service = container.resolve('dataSourceService');

// Used by HTTP controller
await service.registerPostGISConnection(config);

// Used by background job
await service.refreshDataSourceMetadata();

// Used by CLI tool
await service.exportDataSources();
```

### 3. **Maintainability**
- Business logic changes only affect service layer
- Controllers remain thin and stable
- Easy to swap implementations (e.g., PostgreSQL → MongoDB)

### 4. **Separation of Concerns**
- Controllers: HTTP protocol concerns
- Services: Business logic
- Repositories: Data access
- Each layer has single responsibility

### 5. **Scalability**
- Easy to add caching layer in services
- Easy to add transaction management
- Easy to add event publishing

---

## Migration Strategy

### Option A: Incremental Refactoring (Recommended)

1. **Week 1**: Create service layer foundation + DataSourceService
2. **Week 2**: Refactor DataSourceController + FileUploadController
3. **Week 3**: Refactor ChatController + ToolController
4. **Week 4**: Add DI container + update all routes
5. **Week 5**: Testing + documentation

**Pros**: Low risk, can test incrementally  
**Cons**: Takes longer, temporary inconsistency

### Option B: Big Bang Refactoring

1. Create all services at once
2. Refactor all controllers in one PR
3. Update routes and tests

**Pros**: Clean break, consistent architecture  
**Cons**: High risk, harder to debug, large PR

---

## Estimated Effort

| Phase | Task | Hours |
|-------|------|-------|
| 1 | Service layer foundation | 2-3 |
| 2 | Implement DataSourceService | 3-4 |
| 3 | DI container | 2-3 |
| 4 | Refactor all controllers | 4-6 |
| 5 | Update routes + tests | 2-3 |
| **Total** | | **13-19 hours** |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking existing functionality | Medium | High | Comprehensive tests, incremental rollout |
| Performance overhead | Low | Low | Services are thin wrapper, minimal overhead |
| Team learning curve | Medium | Medium | Documentation, code reviews, examples |
| Migration complexity | Medium | Medium | Clear migration guide, rollback plan |

---

## Success Metrics

After refactoring, we should see:

1. ✅ Controllers < 100 lines each (currently up to 600+)
2. ✅ Services contain 80%+ of business logic
3. ✅ Unit test coverage increases from ~30% to ~70%
4. ✅ No direct database calls in controllers
5. ✅ Easy to add new endpoints (just add service method + controller route)

---

## Conclusion

This refactoring aligns the codebase with **industry best practices** and prepares the system for:

- **Production deployment** (testability, maintainability)
- **Team collaboration** (clear boundaries, easy onboarding)
- **Feature expansion** (modular, extensible architecture)
- **Performance optimization** (caching, transactions in service layer)

The investment of ~15 hours will pay dividends in reduced maintenance costs and improved development velocity.
