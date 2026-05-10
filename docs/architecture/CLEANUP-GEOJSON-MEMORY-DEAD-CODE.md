# geojson-memory 死代码清理报告

## 📋 清理概述

**日期**: 2026-05-11  
**原因**: `geojson-memory` 类型从未被实际使用，是设计遗留的死代码

---

## 🔍 问题分析

### 发现过程

1. **架构审查时发现 fallback 机制不合理**
   - `MVTServiceController` 和 `MVTOnDemandController` 功能重叠
   - Route 层使用 `.catch()` fallback 掩盖职责不清

2. **深入分析 MVTOnDemandPublisher 使用情况**
   - 搜索整个项目：**0处**实际调用 `publish({type: 'geojson-memory', ...})`
   - API 端点 `/api/services/mvt/publish` **未注册**
   - 前端代码：**0处**相关调用
   - 测试代码：**0处**使用

3. **结论**: `geojson-memory` 是完整的"僵尸功能"
   - 代码实现了但无入口
   - 类型定义了但无业务逻辑使用
   - Controller 方法有了但路由没注册

---

## ✂️ 清理内容

### 1. 类型定义清理

**文件**: `server/src/utils/publishers/base/MVTPublisherTypes.ts`

#### 删除的内容:
```typescript
// ❌ 删除
export interface GeoJSONInMemorySource {
  type: 'geojson-memory';
  featureCollection: any;
}

// ❌ 从联合类型中移除
export type MVTSource = PostGISDataSource | GeoJSONFileSource | GeoJSONInMemorySource;
// ✅ 改为
export type MVTSource = PostGISDataSource | GeoJSONFileSource;
```

#### 更新的元数据类型:
```typescript
// ❌ 之前
sourceType?: 'postgis' | 'geojson-file' | 'geojson-memory';

// ✅ 之后
sourceType?: 'postgis' | 'geojson-file';
```

---

### 2. MVTOnDemandPublisher 清理

**文件**: `server/src/utils/publishers/MVTOnDemandPublisher.ts`

#### publish() 方法中的分支删除:
```typescript
// ❌ 删除整个 case 分支 (第204-219行)
case 'geojson-memory':
  tilesetId = await this.publishGeoJSONInMemory(
    source.featureCollection,
    { minZoom, maxZoom, extent, tolerance, buffer, layerName },
    options.tilesetId
  );
  metadata = {
    sourceType: 'geojson-memory',
    minZoom,
    maxZoom,
    extent,
    generatedAt: new Date().toISOString(),
    featureCount: source.featureCollection.features?.length || 0,
    cacheEnabled: true
  };
  break;
```

#### getTile() 方法中的分支删除:
```typescript
// ❌ 之前
switch (metadata.sourceType) {
  case 'geojson-memory':  // ← 删除此行
  case 'geojson-file':
    tileBuffer = this.getGeoJSONTile(tilesetId, z, x, y, metadata.extent);
    break;
  // ...
}

// ✅ 之后
switch (metadata.sourceType) {
  case 'geojson-file':
    tileBuffer = this.getGeoJSONTile(tilesetId, z, x, y, metadata.extent);
    break;
  // ...
}
```

**注意**: `publishGeoJSONInMemory()` 方法**保留**，因为 `publishGeoJSONFile()` 内部仍在使用它。

---

### 3. MVTDynamicController 清理

**文件**: `server/src/api/controllers/MVTDynamicController.ts`

#### API 文档注释更新:
```typescript
// ❌ 删除示例 1 (GeoJSON in-memory)
// ✅ 重新编号: 2→1, 3→2, 4→3
```

#### 参数验证逻辑删除:
```typescript
// ❌ 删除验证逻辑
if (!['geojson-memory', 'geojson-file', 'postgis'].includes(source.type)) {
  res.status(400).json({
    error: `Invalid source type: ${source.type}. Must be one of: geojson-memory, geojson-file, postgis`
  });
  return;
}

// ✅ 改为
if (!['geojson-file', 'postgis'].includes(source.type)) {
  res.status(400).json({
    error: `Invalid source type: ${source.type}. Must be one of: geojson-file, postgis`
  });
  return;
}
```

```typescript
// ❌ 删除特定验证
if (source.type === 'geojson-memory' && !source.featureCollection) {
  res.status(400).json({
    error: 'geojson-memory source requires featureCollection field'
  });
  return;
}
```

---

## 📊 影响范围

### 修改的文件 (3个)
1. ✅ `server/src/utils/publishers/base/MVTPublisherTypes.ts`
2. ✅ `server/src/utils/publishers/MVTOnDemandPublisher.ts`
3. ✅ `server/src/api/controllers/MVTDynamicController.ts`

### 删除的代码行数
- **类型定义**: 8 行
- **业务逻辑**: 18 行
- **验证逻辑**: 20 行
- **文档注释**: 15 行
- **总计**: ~61 行

### 保留的功能
- ✅ `geojson-file` 类型（完全正常）
- ✅ `postgis` 类型（完全正常）
- ✅ `publishGeoJSONInMemory()` 方法（被 `publishGeoJSONFile()` 内部使用）

---

## ✅ 验证结果

### 编译检查
```bash
✅ TypeScript 编译通过
✅ 无新增错误
⚠️  3个预存在的 ESLint warning (与本次修改无关)
```

### 代码搜索验证
```bash
$ grep -r "geojson-memory" server/src/
# 结果: 0 matches ✅
```

### 功能完整性
- ✅ MVTOnDemandPublisher 仍可处理 `geojson-file` 和 `postgis`
- ✅ MVTStrategyPublisher 不受影响
- ✅ VisualizationServicePublisher 不受影响
- ✅ DataSourcePublishingService 不受影响

---

## 🎯 架构意义

### 清理前的问题
```
┌─────────────────────────────────────┐
│   MVTOnDemandPublisher              │
│                                     │
│  • geojson-memory ❌ (死代码)       │
│  • geojson-file     ✅ (在用)       │
│  • postgis         ✅ (在用)        │
│                                     │
│  问题:                              │
│  - 1/3 的功能从未使用               │
│  - 混淆架构理解                     │
│  - 增加维护成本                     │
└─────────────────────────────────────┘
```

### 清理后的状态
```
┌─────────────────────────────────────┐
│   MVTOnDemandPublisher              │
│                                     │
│  • geojson-file     ✅ (在用)       │
│  • postgis         ✅ (在用)        │
│                                     │
│  优势:                              │
│  - 100% 代码都在使用                │
│  - 清晰的职责边界                   │
│  - 降低认知负担                     │
└─────────────────────────────────────┘
```

---

## 🚀 后续建议

### 短期 (本周)
1. ✅ 完成 geojson-memory 清理
2. ⏳ 考虑是否继续清理整个 MVTOnDemandPublisher
   - 如果确认没有被主动调用
   - 可以完全移除，统一使用 MVTStrategyPublisher

### 中期 (本月)
1. 统一 MVT Publisher 架构
   - 方案A: 合并两个 Publisher
   - 方案B: 明确分工并完善文档
2. 移除 Route 层的 fallback 机制
3. 创建统一的 VisualizationServiceController

### 长期 (下季度)
1. 建立死代码检测机制
2. 定期审查未使用的 API 端点
3. 完善集成测试覆盖

---

## 📝 总结

**本次清理的价值**:
1. ✅ 移除了 100% 未被使用的代码
2. ✅ 简化了类型系统
3. ✅ 提高了代码可读性
4. ✅ 为后续架构重构铺平道路

**关键洞察**:
- `geojson-memory` 是一个典型的设计遗留问题
- 完整的实现但没有业务入口
- 说明了**定期代码审查**的重要性

**下一步行动**:
- 基于此清理，可以继续评估是否需要保留整个 `MVTOnDemandPublisher`
- 或者将其有价值的部分（如内存缓存）整合到 `MVTStrategyPublisher`

---

**清理执行者**: AI Assistant  
**审核状态**: 待人工审核  
**回滚方案**: Git revert (如有需要)

