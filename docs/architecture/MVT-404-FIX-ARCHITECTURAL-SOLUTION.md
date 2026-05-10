# MVT 404 问题修复 - 架构职责分离方案

**日期**: 2026-05-11  
**问题**: 自然语言生成的查询结果访问 MVT 变成 404  
**根本原因**: GeoAIGraph 绕过 VisualizationServicePublisher，直接调用 MVTStrategyPublisher，导致服务未注册到 registry  
**解决方案**: 在 Service 层添加 NativeData 支持，保持职责分离  

---

## 🎯 架构原则

### **职责分离**

```
┌─────────────────────────────────────────┐
│   GeoAIGraph (工作流编排层)              │
│                                         │
│   ✅ 职责:                               │
│   - 执行计划                             │
│   - 调用插件                             │
│   - 发布结果（传递 NativeData）          │
│                                         │
│   ❌ 不应该:                             │
│   - 知道 MVTSource 格式                  │
│   - 处理数据格式转换                     │
│   - 了解 PostGIS/GeoJSON 细节            │
└──────────────┬──────────────────────────┘
               │ passes NativeData
               ▼
┌─────────────────────────────────────────┐
│   VisualizationServicePublisher         │
│   (服务发布层 - 统一入口)                 │
│                                         │
│   ✅ 职责:                               │
│   - 接收 NativeData                     │
│   - 内部转换为 MVTSource（封装细节）     │
│   - 调用底层 Publisher                   │
│   - 注册到 Registry ⭐                  │
│   - 设置 TTL                            │
│                                         │
│   新增方法:                              │
│   publishMVTFromNativeData()            │
└──────────────┬──────────────────────────┘
               │ delegates to
               ▼
┌─────────────────────────────────────────┐
│   MVTStrategyPublisher                  │
│   (瓦片生成层)                           │
│                                         │
│   ✅ 职责:                               │
│   - 接收 NativeData                     │
│   - 选择策略                             │
│   - 生成瓦片                             │
└─────────────────────────────────────────┘
```

---

## 🔧 实施细节

### **修改 1: VisualizationServicePublisher.ts**

#### **新增方法**: `publishMVTFromNativeData()`

```typescript
/**
 * Publish MVT service from NativeData (unified data abstraction)
 * This is the preferred method for workflow execution
 */
async publishMVTFromNativeData(
  nativeData: NativeData,
  options: MVTTileOptions,
  serviceId?: string,
  ttl?: number
): Promise<ServicePublishResult> {
  // Direct delegation to underlying publisher
  const result = await this.mvtPublisher.publish(nativeData, options);
  
  // Register in registry (关键步骤!)
  this.registry.register(metadata);
  
  return { success: true, serviceId: result.tilesetId, ... };
}
```

**优势**:
- ✅ 接受统一的 NativeData 抽象
- ✅ 自动注册到 registry
- ✅ 封装所有转换逻辑
- ✅ Workflow 层无需关心细节

---

#### **重构现有方法**: `publishMVT()`

```typescript
/**
 * Publish MVT service from various data sources (legacy API)
 * Converts MVTSource to NativeData internally
 */
async publishMVT(
  source: MVTSource,
  options: MVTTileOptions,
  serviceId?: string,
  ttl?: number
): Promise<ServicePublishResult> {
  // Convert MVTSource → NativeData
  let nativeData: NativeData;
  if (source.type === 'postgis') {
    nativeData = { ... };
  } else {
    nativeData = { ... };
  }
  
  // Delegate to unified method
  return this.publishMVTFromNativeData(nativeData, options, serviceId, ttl);
}
```

**优势**:
- ✅ 保持向后兼容（DataSourcePublishingService 仍可使用）
- ✅ 内部复用新方法
- ✅ 单一实现路径

---

### **修改 2: GeoAIGraph.ts**

#### **修复前** (❌ 违反职责分离)

```typescript
// GeoAIGraph.ts - 工作流编排层
// ❌ 不应该知道 MVTSource 的具体格式

let mvtSource: any;
if (analysisResult.data.type === 'postgis') {
  mvtSource = {
    type: 'postgis',
    connection: analysisResult.data.metadata?.connection,
    tableName: analysisResult.data.reference,
    geometryColumn: analysisResult.data.metadata?.geometryColumn || 'geom'
  };
} else {
  mvtSource = {
    type: 'geojson-file',
    filePath: analysisResult.data.reference
  };
}

publishResult = await unifiedPublisher.publishMVT(
  mvtSource,  // ← 需要手动转换
  mvtOptions,
  stepId,
  3600000
);
```

**问题**:
- ❌ GeoAIGraph 知道 MVTSource 格式
- ❌ 硬编码转换逻辑
- ❌ 重复代码（与 DataSourcePublishingService 类似）

---

#### **修复后** (✅ 职责清晰)

```typescript
// GeoAIGraph.ts - 工作流编排层
// ✅ 只传递 NativeData，不关心转换细节

publishResult = await unifiedPublisher.publishMVTFromNativeData(
  analysisResult.data,  // ← 直接传递 NativeData
  mvtOptions,
  stepId,
  3600000
);
```

**优势**:
- ✅ GeoAIGraph 只传递 NativeData
- ✅ 不知道 MVTSource 格式
- ✅ 转换逻辑封装在 Service 层
- ✅ 代码简洁（减少 17 行）

---

## 📊 效果对比

### **代码行数变化**

| 文件 | 修改前 | 修改后 | 变化 |
|------|--------|--------|------|
| VisualizationServicePublisher.ts | 724 | 773 | +49 |
| GeoAIGraph.ts | 450 | 433 | -17 |
| **总计** | **1174** | **1206** | **+32** |

**净增加**: 32 行（但职责更清晰）

---

### **职责清晰度**

| 维度 | 修复前 | 修复后 |
|------|--------|--------|
| **GeoAIGraph 职责** | ❌ 混合（编排+转换） | ✅ 纯粹（仅编排） |
| **Service 层职责** | ⚠️ 部分（缺少 NativeData 支持） | ✅ 完整（统一入口） |
| **数据转换位置** | ❌ 分散（多处重复） | ✅ 集中（Service 层） |
| **Registry 注册** | ❌ 遗漏（GeoAIGraph 路径） | ✅ 保证（所有路径） |
| **可维护性** | ⚠️ 中 | ✅ 高 |

---

## ✅ 问题解决验证

### **修复前的流程**

```
GeoAIGraph
  → MVTStrategyPublisher.publish()  ← ❌ 绕过 Service 层
  → 生成 tileset（文件系统）
  → ❌ 未注册到 Registry
  
MVTController.serveTile()
  → VisualizationServicePublisher.getMVTTile()
    → registry.get(tilesetId)  ← ❌ 找不到！
    → return null
  → HTTP 404
```

---

### **修复后的流程**

```
GeoAIGraph
  → VisualizationServicePublisher.publishMVTFromNativeData()
    → MVTStrategyPublisher.publish()
    → 生成 tileset（文件系统）
    → ✅ registry.register()  ← 自动注册！
    
MVTController.serveTile()
  → VisualizationServicePublisher.getMVTTile()
    → registry.get(tilesetId)  ← ✅ 找到！
    → mvtPublisher.getTile()
    → return Buffer
  → HTTP 200 + Tile Data
```

---

## 🎓 架构经验教训

### **1. 分层架构的核心原则**

```
上层不应该知道下层的实现细节
```

- ❌ GeoAIGraph（编排层）不应该知道 MVTSource 格式
- ✅ GeoAIGraph 应该只使用 NativeData（统一抽象）
- ✅ 转换逻辑应该在 Service 层（适配层）

---

### **2. 统一入口的重要性**

```
所有发布操作都应该通过同一个入口
```

- ✅ `VisualizationServicePublisher` 是唯一的服务发布入口
- ✅ 无论数据来源（DataSource / Workflow），都通过这个入口
- ✅ 保证 Registry 注册的一致性

---

### **3. 封装转换逻辑**

```
数据格式转换应该封装在适当的层级
```

- ❌ 不要在 Workflow 层做数据转换
- ✅ 在 Service 层做转换（适配不同输入格式）
- ✅ 对外暴露统一的接口（NativeData）

---

### **4. 避免重复代码**

```
相同的转换逻辑不应该出现在多个地方
```

**修复前**:
- DataSourcePublishingService 中有 MVTSource 转换
- GeoAIGraph 中也有类似的转换（重复！）

**修复后**:
- 只在 VisualizationServicePublisher 中有转换逻辑
- 所有调用方都复用这个逻辑

---

## 🚀 后续优化建议

### **短期**（已完成）

- ✅ 添加 `publishMVTFromNativeData()` 方法
- ✅ 简化 GeoAIGraph 的发布逻辑
- ✅ 保证所有路径都注册到 Registry

---

### **中期**（可选）

1. **统一 DataSourcePublishingService**
   ```typescript
   // 也可以改用新方法
   const result = await this.publisher.publishMVTFromNativeData(
     nativeData,  // 从 DataSourceRecord 转换
     options,
     dataSource.id,
     ttl
   );
   ```

2. **添加类型安全**
   ```typescript
   // 为 NativeData 到 MVTSource 的转换添加专用函数
   function convertNativeDataToMVTSource(nativeData: NativeData): MVTSource {
     // Type-safe conversion
   }
   ```

3. **添加单元测试**
   - 测试 `publishMVTFromNativeData()` 正确注册
   - 测试 GeoAIGraph 发布的瓦片可访问
   - 测试 TTL 过期机制

---

## 📝 总结

### **核心改进**

1. ✅ **职责分离**: GeoAIGraph 不再关心数据格式转换
2. ✅ **统一入口**: 所有 MVT 发布都通过 VisualizationServicePublisher
3. ✅ **自动注册**: 保证所有服务都注册到 Registry
4. ✅ **消除重复**: 转换逻辑集中在 Service 层
5. ✅ **向后兼容**: 保留旧的 `publishMVT()` API

---

### **解决的问题**

- ✅ 自然语言生成的结果可以正常访问 MVT 瓦片
- ✅ 原始数据源仍然正常工作
- ✅ 架构职责更加清晰
- ✅ 代码更易维护

---

**状态**: ✅ 已完成并验证  
**影响范围**: 低（只修改 2 个文件，保持向后兼容）  
**风险**: 低（新增方法，不破坏现有功能）
