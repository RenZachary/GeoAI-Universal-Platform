# MVT Publisher 重构方案

## 📋 当前问题分析

### 1. 命名混淆
- `MVTPublisher` - 使用策略模式，支持预生成和按需生成
- `MVTDynamicPublisher` - 仅支持按需生成，但名称中的 "Dynamic" 不够明确

**问题**: 从名称无法区分两者的核心差异

### 2. 职责重叠
两者都处理 MVT 瓦片生成，但：
- `MVTPublisher`: 与插件系统深度集成，使用 `NativeData` 和 `DataAccessor`
- `MVTDynamicPublisher`: 用于数据源自动发布，直接接收数据源配置

### 3. 缺少统一抽象
没有共同的基类或接口定义，导致：
- 代码重复（如目录创建、元数据管理）
- 无法通过统一接口切换实现
- 测试和扩展困难

---

## 🎯 重构目标

### 1. 清晰的命名体系
```
BaseMVTPublisher          - 抽象基类（定义通用接口）
├─ MVTStrategyPublisher   - 策略模式实现（原 MVTPublisher）
└─ MVTOnDemandPublisher   - 按需生成实现（原 MVTDynamicPublisher）
```

### 2. 明确的职责划分
| 类名 | 职责 | 使用场景 |
|------|------|----------|
| `MVTStrategyPublisher` | 插件工作流中的 MVT 生成 | 用户通过聊天触发可视化 |
| `MVTOnDemandPublisher` | 数据源自动发布为 MVT 服务 | 用户上传数据后自动发布 |

### 3. 统一的接口
所有 MVT 发布者实现相同的接口：
```typescript
interface BaseMVTPublisher {
  publish(...): Promise<MVTPublishResult>;
  getTile(tilesetId, z, x, y): Promise<Buffer | null>;
  listTilesets(): Array<{tilesetId, metadata}>;
  deleteTileset(tilesetId): boolean;
  getMetadata(tilesetId): any | null;
}
```

---

## 🔧 重构步骤

### Step 1: 创建基类 ✅
文件: `server/src/utils/publishers/BaseMVTPublisher.ts`
- 已创建抽象基类
- 定义通用接口和方法

### Step 2: 重命名 MVTDynamicPublisher → MVTOnDemandPublisher

#### 2.1 重命名文件
```bash
mv MVTDynamicPublisher.ts MVTOnDemandPublisher.ts
```

#### 2.2 修改类名和导出
```typescript
// 旧代码
export class MVTDynamicPublisher { ... }
export function getMVTPublisher(...) { ... }
export function resetMVTPublisher() { ... }

// 新代码
export class MVTOnDemandPublisher extends BaseMVTPublisher { ... }
export function getMVTOnDemandPublisher(...) { ... }
export function resetMVTOnDemandPublisher() { ... }
```

#### 2.3 更新引用文件
需要更新以下文件中的导入和使用：
- `server/src/services/DataSourcePublishingService.ts`
- `server/src/services/index.ts`
- `server/src/api/controllers/MVTDynamicController.ts`
- `server/src/api/controllers/DataSourceController.ts`
- `server/src/api/routes/index.ts`

### Step 3: 重命名 MVTPublisher → MVTStrategyPublisher

#### 3.1 重命名文件
```bash
mv MVTPublisher.ts MVTStrategyPublisher.ts
```

#### 3.2 修改类名和导出
```typescript
// 旧代码
export class MVTPublisher { ... }

// 新代码
export class MVTStrategyPublisher extends BaseMVTPublisher { ... }
```

#### 3.3 更新引用文件
需要更新以下文件中的导入和使用：
- `server/src/plugin-orchestration/executor/visualization/MVTPublisherExecutor.ts`
- `server/src/plugin-orchestration/executor/visualization/ChoroplethMVTExecutor.ts`
- `server/src/api/controllers/MVTServiceController.ts`
- `server/src/storage/filesystem/CleanupScheduler.ts`

### Step 4: 让两个类继承 BaseMVTPublisher

#### 4.1 MVTOnDemandPublisher 继承基类
```typescript
export class MVTOnDemandPublisher extends BaseMVTPublisher {
  constructor(workspaceBase: string, cacheSize: number = 10000) {
    super(workspaceBase, 'mvt-dynamic');  // 调用基类构造函数
    // ... 其他初始化代码
  }
  
  // 实现基类的抽象方法
  async publish(source: MVTSource, options: MVTTileOptions = {}, tilesetId?: string): Promise<MVTPublishResult> {
    // ... 现有实现
  }
  
  async getTile(tilesetId: string, z: number, x: number, y: number): Promise<Buffer | null> {
    // ... 现有实现
  }
  
  listTilesets(): Array<{ tilesetId: string; metadata: any }> {
    // ... 现有实现
  }
  
  deleteTileset(tilesetId: string): boolean {
    // ... 现有实现
  }
  
  getMetadata(tilesetId: string): any | null {
    // ... 现有实现
  }
}
```

#### 4.2 MVTStrategyPublisher 继承基类
```typescript
export class MVTStrategyPublisher extends BaseMVTPublisher {
  constructor(workspaceBase: string, db?: Database.Database) {
    super(workspaceBase, 'mvt');  // 调用基类构造函数
    // ... 其他初始化代码
  }
  
  // 注意：MVTStrategyPublisher 的 API 略有不同
  // publish() 对应 generateTiles()
  async publish(nativeData: NativeData, options: MVTTileOptions = {}): Promise<MVTPublishResult> {
    const tilesetId = await this.generateTiles(nativeData, options);
    return {
      success: true,
      tilesetId,
      serviceUrl: `/api/services/mvt/${tilesetId}/{z}/{x}/{y}.pbf`,
      metadata: this.getMetadata(tilesetId)
    };
  }
  
  // 其他方法实现...
}
```

### Step 5: 更新 DataSourcePublishingService

这个 Service 是**业务编排层**，不应该直接依赖具体的 Publisher 实现。

#### 5.1 当前架构
```typescript
// 现在：直接依赖 MVTOnDemandPublisher
import { MVTDynamicPublisher } from '../utils/publishers/MVTDynamicPublisher';

export class DataSourcePublishingService {
  private mvtPublisher: MVTDynamicPublisher;
  
  constructor(db: Database.Database, workspaceBase: string, mvtPublisher?: MVTDynamicPublisher) {
    this.mvtPublisher = mvtPublisher || MVTDynamicPublisher.getInstance(workspaceBase, 10000);
  }
}
```

#### 5.2 改进：依赖倒置
```typescript
// 改进后：依赖抽象基类
import { BaseMVTPublisher } from '../utils/publishers/BaseMVTPublisher';
import { MVTOnDemandPublisher } from '../utils/publishers/MVTOnDemandPublisher';

export class DataSourcePublishingService {
  private mvtPublisher: BaseMVTPublisher;  // 使用基类类型
  
  constructor(
    db: Database.Database, 
    workspaceBase: string, 
    mvtPublisher?: BaseMVTPublisher  // 接受任何实现
  ) {
    this.mvtPublisher = mvtPublisher || new MVTOnDemandPublisher(workspaceBase, 10000);
  }
}
```

**好处**:
- ✅ 可以轻松替换为其他 MVT 实现
- ✅ 便于单元测试（可以注入 mock）
- ✅ 符合依赖倒置原则

---

## 📊 重构后的架构

```
┌──────────────────────────────────────────────────────┐
│         DataSourcePublishingService (服务层)          │
│  依赖: BaseMVTPublisher (抽象)                        │
└──────────────┬───────────────────────┬───────────────┘
               │                       │
     ┌─────────▼────────────┐  ┌──────▼──────────────┐
     │ MVTOnDemandPublisher │  │ WMSPublisher         │
     │ (按需生成)            │  │ (WMS 栅格服务)       │
     │ - GeoJSON in-memory  │  │ - GeoTIFF rendering  │
     │ - GeoJSON file       │  │ - coordinate transform│
     │ - PostGIS native     │  │ - strategy pattern   │
     │ - memory cache       │  └──────────────────────┘
     └──────────────────────┘
     
┌──────────────────────────────────────────────────────┐
│        MVTStrategyPublisher (策略模式)                │
│  使用场景: 插件工作流                                  │
│  - GeoJSONStrategy                                   │
│  - ShapefileStrategy                                 │
│  - PostGISStrategy (TODO)                            │
└──────────────────────────────────────────────────────┘

共同基类: BaseMVTPublisher
- publish()
- getTile()
- listTilesets()
- deleteTileset()
- getMetadata()
```

---

## ⚠️ 注意事项

### 1. API 兼容性
- `MVTStrategyPublisher` 的 `generateTiles()` 方法应保留作为内部方法
- 新增 `publish()` 方法以符合基类接口
- 保持向后兼容，旧的调用方式仍然有效

### 2. 输出目录隔离
- `MVTStrategyPublisher`: `workspace/results/mvt/`
- `MVTOnDemandPublisher`: `workspace/results/mvt-dynamic/`
- 确保两个目录不冲突

### 3. 单例模式
两个 Publisher 都使用单例模式，重构后应保持：
```typescript
// MVTOnDemandPublisher
static getInstance(workspaceBase?: string, cacheSize: number = 10000): MVTOnDemandPublisher

// MVTStrategyPublisher
static getInstance(workspaceBase: string, db?: Database.Database): MVTStrategyPublisher
```

### 4. 测试覆盖
重构后需要验证：
- [ ] 插件工作流中的 MVT 生成正常
- [ ] 数据源自动发布功能正常
- [ ] API 端点返回正确的瓦片数据
- [ ] 缓存机制正常工作
- [ ] 清理调度器正常工作

---

## 📝 迁移检查清单

### 文件重命名
- [ ] `MVTDynamicPublisher.ts` → `MVTOnDemandPublisher.ts`
- [ ] `MVTPublisher.ts` → `MVTStrategyPublisher.ts`

### 类名更新
- [ ] `MVTDynamicPublisher` → `MVTOnDemandPublisher`
- [ ] `MVTPublisher` → `MVTStrategyPublisher`
- [ ] `getMVTPublisher()` → `getMVTOnDemandPublisher()`
- [ ] `resetMVTPublisher()` → `resetMVTOnDemandPublisher()`

### 引用更新 - MVTOnDemandPublisher
- [ ] `server/src/services/DataSourcePublishingService.ts`
- [ ] `server/src/services/index.ts`
- [ ] `server/src/api/controllers/MVTDynamicController.ts`
- [ ] `server/src/api/controllers/DataSourceController.ts`
- [ ] `server/src/api/routes/index.ts`

### 引用更新 - MVTStrategyPublisher
- [ ] `server/src/plugin-orchestration/executor/visualization/MVTPublisherExecutor.ts`
- [ ] `server/src/plugin-orchestration/executor/visualization/ChoroplethMVTExecutor.ts`
- [ ] `server/src/api/controllers/MVTServiceController.ts`
- [ ] `server/src/storage/filesystem/CleanupScheduler.ts`

### 继承基类
- [ ] `MVTOnDemandPublisher extends BaseMVTPublisher`
- [ ] `MVTStrategyPublisher extends BaseMVTPublisher`
- [ ] 实现所有抽象方法

### 测试验证
- [ ] 运行现有测试套件
- [ ] 手动测试 MVT 瓦片服务
- [ ] 验证数据源自动发布功能
- [ ] 检查日志无错误

---

## 🎉 重构收益

1. **清晰的命名**: 从类名即可知道用途
2. **统一的接口**: 所有 MVT 发布者遵循相同契约
3. **更好的可测试性**: 可以通过基类注入 mock
4. **易于扩展**: 新增 MVT 实现只需继承基类
5. **减少重复**: 公共逻辑提取到基类
6. **符合 SOLID 原则**: 
   - 单一职责 (SRP)
   - 开闭原则 (OCP)
   - 依赖倒置 (DIP)

---

## 🚀 执行建议

**分阶段执行**:
1. **Phase 1**: 创建基类，不修改现有代码
2. **Phase 2**: 重命名 `MVTDynamicPublisher` → `MVTOnDemandPublisher`，更新所有引用
3. **Phase 3**: 重命名 `MVTPublisher` → `MVTStrategyPublisher`，更新所有引用
4. **Phase 4**: 让两个类继承基类，实现抽象方法
5. **Phase 5**: 全面测试，修复问题

**预计时间**: 2-3 小时（包括测试）
