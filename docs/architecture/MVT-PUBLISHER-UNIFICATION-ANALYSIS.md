# MVT Publisher 统一可行性分析

**日期**: 2026-05-11  
**主题**: MVTStrategyPublisher vs MVTOnDemandPublisher 是否可以统一？  
**结论**: ⚠️ **部分可行，但需要谨慎设计**

---

## 📊 核心差异对比

### 1. 架构模式对比

| 维度 | MVTStrategyPublisher | MVTOnDemandPublisher |
|------|---------------------|---------------------|
| **设计模式** | 策略模式 (Strategy Pattern) | 直接实现 + 内存缓存 |
| **输入格式** | `NativeData` (统一数据模型) | `MVTSource` (联合类型) |
| **扩展性** | ✅ 高（可注册新策略） | ❌ 低（硬编码分支） |
| **职责分离** | ✅ 清晰（策略独立） | ⚠️ 混合（所有逻辑在一个类） |
| **测试友好度** | ✅ 高（可 mock 策略） | ⚠️ 中（需 mock 整个类） |

---

### 2. 支持的数据源对比

| 数据源类型 | MVTStrategyPublisher | MVTOnDemandPublisher | 实现方式 |
|-----------|---------------------|---------------------|---------|
| **GeoJSON File** | ✅ 通过 GeoJSONMVTTStrategy | ✅ 通过 publishGeoJSONFile | 都使用 geojson-vt |
| **Shapefile** | ✅ 通过 ShapefileMVTTStrategy | ❌ 不支持 | Strategy 先转换为 GeoJSON |
| **PostGIS** | ✅ 通过 PostGISMVTTStrategy | ✅ 通过 publishPostGIS | 都使用 ST_AsMVT() |
| **GeoJSON Memory** | ❌ 不支持 | ❌ 已删除（死代码） | - |

**关键发现**:
- ✅ GeoJSON File: 两者实现几乎相同
- ✅ PostGIS: 两者都使用 PostGISTileGenerator（共享代码）
- ⚠️ Shapefile: 只有 Strategy Publisher 支持
- ❌ GeoJSON Memory: 已清理，不再考虑

---

### 3. 技术实现对比

#### A. GeoJSON 处理方式

**MVTStrategyPublisher (GeoJSONMVTTStrategy)**:
```typescript
// 1. 读取文件
const featureCollection = JSON.parse(fs.readFileSync(sourceReference));

// 2. 创建 tile index
const tileIndex = geojsonvt(featureCollection, options);

// 3. 缓存到 Map<string, GeoJSONVT>
this.tileIndexCache.set(tilesetId, { tileIndex, options, ... });

// 4. 保存元数据到磁盘
fs.writeFileSync(metadataPath, JSON.stringify(metadata));
```

**MVTOnDemandPublisher**:
```typescript
// 1. 读取文件
const featureCollection = JSON.parse(fs.readFileSync(filePath));

// 2. 创建 tile index
const tileIndex = geojsonvt(featureCollection, options);

// 3. 缓存到 Map<string, any>
this.geojsonTileIndexes.set(tilesetId, tileIndex);

// 4. 保存元数据到磁盘
this.saveMetadata(tilesetId, metadata);
```

**结论**: ✅ **实现几乎完全相同**，只是缓存结构略有差异

---

#### B. PostGIS 处理方式

**MVTStrategyPublisher (PostGISMVTTStrategy)**:
```typescript
// 1. 从 NativeData.metadata 解析连接信息
const connectionInfo = PostGISConnectionParser.parse(sourceReference, nativeData.metadata);

// 2. 创建连接池
const pool = await this.tileGenerator.createPool(poolConfig);
this.postgisPools.set(tilesetId, pool);

// 3. 缓存连接信息和配置
this.tileIndexCache.set(tilesetId, { connectionInfo, options, ... });

// 4. getTile 时调用 PostGISTileGenerator.generateTile()
const result = await this.tileGenerator.generateTile(pool, z, x, y, query, options);
```

**MVTOnDemandPublisher**:
```typescript
// 1. 从 MVTSource 获取连接信息
const source = this.postgisConfigs.get(tilesetId);

// 2. 创建连接池（通过 PostGISTileGenerator）
const pool = await this.postgisGenerator.createPool(source.connection);

// 3. getTile 时调用 PostGISTileGenerator.generateTile()
const result = await this.postgisGenerator.generateTile(pool, z, x, y, query, options);
```

**结论**: ✅ **核心逻辑完全相同**，都使用 `PostGISTileGenerator`

---

#### C. 缓存策略对比

| 缓存类型 | MVTStrategyPublisher | MVTOnDemandPublisher |
|---------|---------------------|---------------------|
| **Tile Index 缓存** | `Map<string, GeoJSONVT>` | `Map<string, any>` |
| **PostGIS Pool 缓存** | `Map<string, Pool>` | 通过 PostGISTileGenerator 管理 |
| **瓦片结果缓存** | ❌ 无 | ✅ LRU Cache (10000 tiles) |
| **元数据缓存** | ❌ 每次从磁盘读取 | ✅ `Map<string, MVTPublishMetadata>` |
| **持久化** | ✅ 磁盘元数据 | ✅ 磁盘元数据 + 启动时加载 |

**关键差异**:
- MVTOnDemandPublisher 有 **瓦片级别的 LRU 缓存**（性能优势）
- MVTOnDemandPublisher 有 **元数据内存缓存**（减少磁盘 I/O）
- MVTStrategyPublisher 更轻量，依赖文件系统

---

### 4. API 接口对比

| 方法 | MVTStrategyPublisher | MVTOnDemandPublisher | 兼容性 |
|------|---------------------|---------------------|--------|
| `publish()` | `(nativeData, options)` | `(source, options)` | ❌ 参数不同 |
| `getTile()` | `(tilesetId, z, x, y)` | `(tilesetId, z, x, y)` | ✅ 相同 |
| `listTilesets()` | `Array<{tilesetId, metadata}>` | `Array<{tilesetId, metadata}>` | ✅ 相同 |
| `deleteTileset()` | `(tilesetId): boolean` | `(tilesetId): boolean` | ✅ 相同 |
| `getMetadata()` | `(tilesetId): Metadata \| null` | 内部使用，未暴露 | ⚠️ 不同 |

**问题**: `publish()` 方法签名不同，需要适配层

---

### 5. 使用场景对比

#### MVTStrategyPublisher 的使用者

1. **GeoAIGraph.ts** (工作流结果发布)
   ```typescript
   const mvtResult = await mvtStrategyPublisher.publish(analysisResult.data, mvtOptions);
   // analysisResult.data 是 NativeData
   ```

2. **VisualizationServicePublisher.ts** (服务层封装)
   ```typescript
   const result = await this.mvtPublisher.publish(nativeData, options);
   // 将 MVTSource 转换为 NativeData 后调用
   ```

3. **MVTPublisherExecutor** (插件执行器)
   ```typescript
   const tilesetId = await publisher.generateTiles(nativeData, options);
   ```

**特点**: 
- ✅ 所有调用都传入 `NativeData`
- ✅ 与工作流深度集成
- ✅ 支持样式配置传递

---

#### MVTOnDemandPublisher 的使用者

**现状**: ❌ **没有任何业务代码主动调用**

- 仅在 Route fallback 中间接使用
- `geojson-memory` 已删除
- `geojson-file` 和 `postgis` 功能与 Strategy Publisher 重复

**潜在价值**:
- ⚠️ 瓦片 LRU 缓存（高性能场景）
- ⚠️ 元数据内存缓存（减少磁盘 I/O）

---

## 🎯 统一方案分析

### 方案 A: 完全合并为一个 Publisher

**思路**: 保留 MVTStrategyPublisher，将 MVTOnDemandPublisher 的优势特性整合进去

#### 优点:
1. ✅ 消除代码重复
2. ✅ 统一的 API 接口
3. ✅ 简化架构理解
4. ✅ 降低维护成本

#### 缺点:
1. ❌ MVTStrategyPublisher 需要大幅改造
2. ❌ 需要添加 LRU 缓存机制
3. ❌ 需要添加元数据内存缓存
4. ❌ 可能影响现有工作流的稳定性

#### 实施难度: 🔴 **高**

**需要的改动**:
```typescript
class UnifiedMVTPublisher extends BaseMVTPublisher {
  // 1. 保留策略模式
  private strategies: Map<DataSourceType, MVTTileGenerationStrategy>;
  
  // 2. 添加 LRU 瓦片缓存（从 OnDemand 迁移）
  private tileCache: TileCache;
  
  // 3. 添加元数据内存缓存（从 OnDemand 迁移）
  private metadataCache: Map<string, MVTPublishMetadata>;
  
  // 4. 统一 publish 接口
  async publish(input: NativeData | MVTSource, options: MVTTileOptions): Promise<MVTPublishResult> {
    // 智能转换：如果是 MVTSource，转换为 NativeData
    const nativeData = this.normalizeInput(input);
    return await this.strategyPublish(nativeData, options);
  }
  
  // 5. getTile 时优先检查缓存
  async getTile(tilesetId, z, x, y): Promise<Buffer | null> {
    const cacheKey = `${tilesetId}/${z}/${x}/${y}`;
    
    // 先查 LRU 缓存
    const cached = this.tileCache.get(cacheKey);
    if (cached) return cached;
    
    // 再查策略生成
    const tile = await this.strategyGetTile(tilesetId, z, x, y);
    
    // 缓存结果
    if (tile) this.tileCache.set(cacheKey, tile);
    
    return tile;
  }
}
```

---

### 方案 B: 保留两个 Publisher，明确分工

**思路**: 不合并，而是明确各自的使用场景

#### 分工设计:

| Publisher | 使用场景 | 优势 | 劣势 |
|-----------|---------|------|------|
| **MVTStrategyPublisher** | 工作流结果、插件执行 | 策略模式、易扩展 | 无瓦片缓存 |
| **MVTOnDemandPublisher** | 高频访问、大数据集 | LRU 缓存、高性能 | 代码重复 |

#### 优点:
1. ✅ 无需大规模重构
2. ✅ 保持现有稳定性
3. ✅ 可以针对不同场景优化

#### 缺点:
1. ❌ 代码重复仍然存在
2. ❌ 开发者需要理解两个系统
3. ❌ MVTOnDemandPublisher 目前未被使用

#### 实施难度: 🟢 **低**

**需要的改动**:
```typescript
// 1. 在文档中明确分工
// 2. 为 MVTOnDemandPublisher 找到实际使用场景
// 3. 或者标记为 deprecated，逐步淘汰
```

---

### 方案 C: 分层架构 - Service 层统一，Publisher 层分离

**思路**: 在 Service 层做统一封装，Publisher 层保持不变

#### 架构设计:

```
┌─────────────────────────────────────┐
│   VisualizationServiceController    │
│   (唯一的 HTTP 入口)                 │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   VisualizationServicePublisher     │
│   (Service 层 - 统一接口)            │
│                                     │
│   publishMVT(input, options) {      │
│     // 智能路由                      │
│     if (input is NativeData)        │
│       → MVTStrategyPublisher        │
│     else if (needs high perf)       │
│       → MVTOnDemandPublisher        │
│   }                                 │
└──┬──────────────┬───────────────────┘
   │              │
   ▼              ▼
┌──────────┐ ┌──────────────┐
│ Strategy │ │ On-Demand    │
│ Publisher│ │ Publisher    │
│          │ │              │
│• 策略模式│ │• LRU 缓存    │
│• Native  │ │• 内存元数据  │
│  Data    │ │• 高性能      │
└──────────┘ └──────────────┘
```

#### 优点:
1. ✅ Controller 层完全统一
2. ✅ 向后兼容性好
3. ✅ 可以逐步迁移
4. ✅ Service 层可以做智能路由

#### 缺点:
1. ⚠️ Publisher 层仍有重复
2. ⚠️ 需要维护路由逻辑

#### 实施难度: 🟡 **中**

**需要的改动**:
```typescript
class VisualizationServicePublisher {
  private strategyPublisher: MVTStrategyPublisher;
  private onDemandPublisher: MVTOnDemandPublisher;
  
  async publishMVT(
    input: NativeData | MVTSource, 
    options: MVTTileOptions,
    useCache: boolean = false  // 新增参数
  ): Promise<ServicePublishResult> {
    // 智能路由逻辑
    if (useCache || this.isHighFrequencyAccess(input)) {
      // 使用带缓存的 OnDemand Publisher
      return await this.onDemandPublisher.publish(input as MVTSource, options);
    } else {
      // 使用 Strategy Publisher
      const nativeData = this.normalizeToNativeData(input);
      return await this.strategyPublisher.publish(nativeData, options);
    }
  }
  
  async getTile(serviceId: string, z, x, y): Promise<Buffer | null> {
    // 根据 serviceId 判断使用哪个 Publisher
    const service = this.registry.get(serviceId);
    if (service.publisherType === 'ondemand') {
      return await this.onDemandPublisher.getTile(serviceId, z, x, y);
    } else {
      return await this.strategyPublisher.getTile(serviceId, z, x, y);
    }
  }
}
```

---

## 💡 推荐方案

### 🏆 **推荐: 方案 C (分层架构)**

**理由**:

1. **最小风险**: 不需要大规模重构现有代码
2. **渐进式改进**: 可以先统一 Service 层，后续再决定是否合并 Publisher
3. **灵活性**: 保留两个 Publisher 的优势特性
4. **清晰的职责**:
   - Controller: HTTP 处理
   - Service: 业务编排 + 智能路由
   - Publisher: 技术实现

---

### 实施步骤

#### Phase 1: Service 层增强 (1-2 天)

1. 在 `VisualizationServicePublisher` 中集成 `MVTOnDemandPublisher`
2. 实现智能路由逻辑
3. 增强 `VisualizationServiceInfo` 记录 `publisherType`
4. 统一 `publishMVT()` 方法签名

```typescript
// 新增方法
private selectPublisher(input: NativeData | MVTSource, options: MVTTileOptions): 'strategy' | 'ondemand' {
  // 规则 1: 如果明确要求缓存
  if (options.useCache) return 'ondemand';
  
  // 规则 2: NativeData → Strategy Publisher
  if (this.isNativeData(input)) return 'strategy';
  
  // 规则 3: PostGIS with complex SQL → OnDemand (动态查询)
  if (input.type === 'postgis' && input.sqlQuery) return 'ondemand';
  
  // 默认: Strategy Publisher
  return 'strategy';
}
```

#### Phase 2: Controller 层统一 (1 天)

1. 创建统一的 `VisualizationServiceController`
2. 移除 Route 层的 fallback 机制
3. 所有请求转发给 Service 层

#### Phase 3: 调用方迁移 (2-3 天)

1. 更新 `GeoAIGraph.ts` 使用 Service 层
2. 更新 `DataSourcePublishingService.ts` (已在用)
3. 添加集成测试

#### Phase 4: 评估与优化 (持续)

1. 监控两个 Publisher 的使用情况
2. 如果 MVTOnDemandPublisher 使用率低，考虑合并
3. 如果都有价值，保持分离并完善文档

---

## ⚠️ 风险与注意事项

### 风险 1: 缓存一致性

**问题**: 如果同一个 tilesetId 被两个 Publisher 同时管理

**解决方案**:
```typescript
// 在 Service 层确保唯一性
async publishMVT(input, options) {
  const tilesetId = this.generateUniqueTilesetId(input);
  
  // 确保只由一个 Publisher 管理
  const publisherType = this.selectPublisher(input, options);
  
  if (publisherType === 'strategy') {
    // 禁用 OnDemand 的缓存
    return await this.strategyPublisher.publish(input, { ...options, useCache: false });
  } else {
    return await this.onDemandPublisher.publish(input, options);
  }
}
```

### 风险 2: tilesetId 命名空间冲突

**问题**: 两个 Publisher 可能生成相同的 tilesetId

**解决方案**:
- 方案 A: 使用前缀 (`strategy_`, `ondemand_`)
- 方案 B: 在 Registry 中记录 publisherType
- 方案 C: 使用 UUID 确保唯一性

### 风险 3: 内存泄漏

**问题**: MVTOnDemandPublisher 的 LRU 缓存可能无限增长

**解决方案**:
```typescript
// 已有 LRU 实现，但需要监控
class InMemoryTileCache {
  private maxSize: number = 10000;
  
  set(key: string, data: Buffer) {
    if (this.cache.size >= this.maxSize) {
      // LRU  eviction
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, data);
  }
}
```

---

## 📋 决策矩阵

| 标准 | 方案 A (完全合并) | 方案 B (保持分离) | 方案 C (分层统一) |
|------|------------------|------------------|------------------|
| **实施难度** | 🔴 高 | 🟢 低 | 🟡 中 |
| **代码重复** | ✅ 消除 | ❌ 保留 | ⚠️ 部分保留 |
| **向后兼容** | ❌ 差 | ✅ 好 | ✅ 好 |
| **性能优化** | ⚠️ 需重新设计 | ✅ 保留优势 | ✅ 保留优势 |
| **维护成本** | ✅ 低 | ❌ 高 | ⚠️ 中 |
| **扩展性** | ✅ 好 | ⚠️ 中 | ✅ 好 |
| **风险** | 🔴 高 | 🟢 低 | 🟡 中 |
| **推荐度** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🎯 最终建议

### 立即执行 (本周)

1. ✅ 完成 `geojson-memory` 死代码清理（已完成）
2. 🔄 实施 **方案 C Phase 1**: Service 层增强
   - 集成 MVTOnDemandPublisher
   - 实现智能路由
   - 增强 Registry

### 短期计划 (本月)

3. 🔄 实施 **方案 C Phase 2**: Controller 层统一
   - 创建 VisualizationServiceController
   - 移除 fallback 机制

4. 🔄 实施 **方案 C Phase 3**: 调用方迁移
   - 更新 GeoAIGraph
   - 添加测试

### 中期评估 (下季度)

5. 📊 监控两个 Publisher 的使用情况
   - 如果 MVTOnDemandPublisher 使用率 < 10% → 考虑方案 A (合并)
   - 如果都有价值 → 保持方案 C，完善文档

---

## 📝 总结

**核心结论**:

1. ✅ **技术上可以统一**，两个 Publisher 的核心逻辑高度相似
2. ⚠️ **但不建议立即完全合并**，风险较高
3. 🏆 **推荐分层统一方案** (方案 C)，平衡了风险和收益
4. 📈 **先统一 Service 层**，观察使用情况后再决定是否合并 Publisher

**关键洞察**:

- 两个 Publisher 的差异主要在**缓存策略**和**输入格式**
- 核心瓦片生成逻辑（geojson-vt, PostGISTileGenerator）**完全相同**
- MVTOnDemandPublisher 的**主要价值是 LRU 缓存**
- 当前 **MVTOnDemandPublisher 未被主动使用**，需要找到合适的场景

**下一步行动**:

开始实施 **方案 C Phase 1**，在 Service 层实现智能路由，为后续的统一奠定基础。

---

**分析者**: AI Assistant  
**审核状态**: 待讨论确认  
**相关文档**: 
- [CLEANUP-GEOJSON-MEMORY-DEAD-CODE.md](./CLEANUP-GEOJSON-MEMORY-DEAD-CODE.md)
- [MVT-PUBLISHER-ARCHITECTURE-COMPARISON.md](./MVT-PUBLISHER-ARCHITECTURE-COMPARISON.md)
