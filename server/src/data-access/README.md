# Data Access Layer

数据访问层提供统一的数据源操作接口，支持多种数据格式（GeoJSON、Shapefile、PostGIS、GeoTIFF）的读取和查询。

## 📁 目录结构

```
data-access/
├── interfaces.ts          # 核心接口定义
│   ├── DataAccessor       # 通用数据访问器接口
│   ├── FileAccessor       # 文件访问器接口
│   ├── DatabaseAccessor   # 数据库访问器接口
│   └── PostGISAccessor    # PostGIS 专用接口
│
├── accessors/            # 访问器实现
│   ├── ShapefileAccessor.ts      # Shapefile 访问器
│   ├── GeoJSONAccessor.ts        # GeoJSON 访问器
│   ├── GeoTIFFAccessor.ts        # GeoTIFF 访问器
│   ├── PostGISAccessor.ts        # PostGIS 访问器
│   └── impl/                     # 基于 Accessor 的实现
│       ├── geojson/
│       ├── shapefile/
│       └── postgis/
│
├── repositories/         # 仓库层（元数据管理）
│   ├── DataSourceRepository.ts   # 数据源元数据仓库
│   └── index.ts
│
├── factories/            # 工厂类
│   └── DataAccessorFactory.ts    # 根据数据源类型创建访问器
│
├── utils/                # 工具类
│   ├── DataSourceDetector.ts     # 自动检测数据源类型
│   └── index.ts
│
└── index.ts              # 统一导出入口
```

## 🏗️ 架构说明

### 1. **Interfaces（接口层）**
定义统一的访问器接口，确保所有数据源实现一致的行为：

```typescript
interface DataAccessor {
  read(): Promise<any>;
  query(filter?: any): Promise<any>;
  getMetadata(): Promise<DataSourceMetadata>;
  statisticalOp(operation: string, field: string): Promise<any>;
  spatialOp(operation: string, params: any): Promise<any>;
}
```

### 2. **Accessors（访问器层）**
**职责**：直接读取和处理数据内容

**实现的访问器**：
- **ShapefileAccessor**：读取 .shp/.shx/.dbf 文件
- **GeoJSONAccessor**：读取 .geojson/.json 文件
- **GeoTIFFAccessor**：读取 .tif/.tiff 栅格数据
- **PostGISAccessor**：连接 PostgreSQL/PostGIS 数据库

**特点**：
- 每种数据源有独立的实现
- 提供统一的查询接口
- 支持空间操作和统计操作
- 返回标准化的数据结构

### 3. **Repositories（仓库层）**
**职责**：管理数据源的元数据（不处理数据内容）

**功能**：
- 注册新的数据源
- 查询数据源列表
- 更新数据源元数据
- 删除数据源记录

**与 Accessors 的区别**：
```
Accessors: 读取数据内容（features、pixels、rows）
Repositories: 管理元数据（name、type、path、schema）
```

### 4. **Factories（工厂层）**
**职责**：根据数据源类型动态创建对应的访问器

**使用示例**：
```typescript
const accessor = DataAccessorFactory.createAccessor({
  type: 'geojson',
  reference: '/path/to/file.geojson'
});
```

**优势**：
- 调用者不需要知道具体使用哪个访问器
- 易于扩展新的数据源类型
- 集中管理创建逻辑

### 5. **Utils（工具层）**
**DataSourceDetector**：
- 自动检测文件类型
- 扫描目录并注册数据源
- 识别 Shapefile 组件文件组

## 🔄 典型使用流程

### 场景 1：读取 GeoJSON 文件

```typescript
// 1. 通过工厂创建访问器
const accessor = DataAccessorFactory.createAccessor({
  type: 'geojson',
  reference: '/workspace/data/cities.geojson'
});

// 2. 读取数据
const data = await accessor.read();
// 返回: { type: 'FeatureCollection', features: [...] }

// 3. 获取元数据
const metadata = await accessor.getMetadata();
// 返回: { geometryType: 'Point', featureCount: 100, fields: [...] }

// 4. 执行统计操作
const stats = await accessor.statisticalOp('mean', 'population');
// 返回: { mean: 50000, min: 1000, max: 100000 }
```

### 场景 2：查询 PostGIS 数据库

```typescript
// 1. 创建 PostGIS 访问器
const accessor = DataAccessorFactory.createAccessor({
  type: 'postgis',
  reference: 'database/schema/table_name'
});

// 2. 执行空间查询
const result = await accessor.spatialOp('buffer', {
  distance: 1000,
  unit: 'meters'
});

// 3. 执行属性查询
const filtered = await accessor.query({
  where: 'population > 100000',
  limit: 10
});
```

### 场景 3：注册新数据源

```typescript
// 1. 获取仓库实例
const repository = new DataSourceRepository(db);

// 2. 注册数据源
await repository.register({
  name: '陕西省市级行政区划',
  type: 'geojson',
  reference: '/workspace/data/shaanxi_cities.geojson',
  metadata: {
    geometryType: 'Polygon',
    featureCount: 10,
    fields: [
      { name: 'name', type: 'string' },
      { name: 'population', type: 'integer' }
    ]
  }
});
```

## 🔒 ESLint 导入约束规则

### ✅ 允许的导入

1. **外部模块** → 通过 `data-access/index.ts` 统一导入
   ```typescript
   // ✅ 正确
   import { DataAccessorFactory, ShapefileAccessor } from '../data-access';
   ```

2. **Factories** → 可以导入 accessors
   ```typescript
   // ✅ DataAccessorFactory.ts 中可以这样导入
   import { ShapefileAccessor } from '../accessors/ShapefileAccessor';
   import { GeoJSONAccessor } from '../accessors/GeoJSONAccessor';
   ```

3. **同层内部导入** → 允许（如 accessors 内部相互引用）
   ```typescript
   // ✅ accessors/impl/geojson/GeoJSONBasedAccessor.ts 中
   import { BaseFileAccessor } from '../BaseFileAccessor';
   ```

### ❌ 禁止的导入

1. **Accessors → Repositories**
   ```typescript
   // ❌ 错误：访问器不应直接导入仓库
   import { DataSourceRepository } from '../repositories/DataSourceRepository';
   
   // ✅ 正确：访问器只负责读取数据，元数据管理由仓库负责
   ```

2. **Repositories → Accessors**
   ```typescript
   // ❌ 错误：仓库不应直接导入访问器
   import { GeoJSONAccessor } from '../accessors/GeoJSONAccessor';
   
   // ✅ 正确：仓库只管理元数据，不处理数据内容
   ```

3. **业务代码 → Factories**（应该通过 index）
   ```typescript
   // ❌ 错误
   import { DataAccessorFactory } from '../data-access/factories/DataAccessorFactory';
   
   // ✅ 正确
   import { DataAccessorFactory } from '../data-access';
   ```

4. **直接导入子模块**（除非有特殊需求）
   ```typescript
   // ❌ 错误：应该通过 index.ts 统一导入
   import { DataSourceDetector } from '../data-access/utils/DataSourceDetector';
   
   // ✅ 正确
   import { DataSourceDetector } from '../data-access';
   ```

### 📋 规则总结

| 导入源 | 目标 | 是否允许 | 说明 |
|--------|------|----------|------|
| 外部模块 | data-access/* | ⚠️ 警告 | 应通过 index.ts 导入 |
| factories/* | accessors/* | ✅ 允许 | 工厂需要创建访问器实例 |
| factories/* | repositories/* | ❌ 禁止 | 工厂不负责元数据管理 |
| accessors/* | repositories/* | ❌ 禁止 | 防止循环依赖 |
| repositories/* | accessors/* | ❌ 禁止 | 保持层次分离 |
| utils/* | 任何层 | ✅ 允许 | 工具类可被任何层使用 |
| 同层内部 | 同层内部 | ✅ 允许 | 合理引用 |

### 🎯 设计原则

1. **职责分离**：Accessors（数据内容）vs Repositories（元数据）
2. **单向依赖**：factories → accessors，两者都不依赖 repositories
3. **工厂模式**：隐藏具体实现，提供统一创建接口
4. **统一出口**：外部模块只通过 `index.ts` 访问内部功能

## 🚀 扩展指南

### 添加新的数据源类型

1. **创建访问器类**：`accessors/{Name}Accessor.ts`
2. **实现 DataAccessor 接口**
3. **在 `DataAccessorFactory` 中注册**
4. **在 `index.ts` 中导出**

**示例**：添加 CSV 访问器

```typescript
// accessors/CSVAccessor.ts
export class CSVAccessor implements FileAccessor {
  async read(): Promise<any> {
    // 读取 CSV 文件并转换为 GeoJSON
  }
  
  async getMetadata(): Promise<DataSourceMetadata> {
    // 提取字段信息
  }
}

// factories/DataAccessorFactory.ts
if (dataSource.type === 'csv') {
  return new CSVAccessor(dataSource.reference);
}

// index.ts
export { CSVAccessor } from './accessors/CSVAccessor';
```

### 添加新的空间操作

1. **在接口中添加方法签名**：`interfaces.ts`
2. **在所有访问器中实现该方法**
3. **添加单元测试**

## 📝 关键概念

### Accessor vs Repository

| 特性 | Accessor | Repository |
|------|----------|------------|
| 职责 | 读取数据内容 | 管理元数据 |
| 操作对象 | 文件、数据库表 | SQLite 记录 |
| 返回值 | Features、Pixels、Rows | Metadata JSON |
| 生命周期 | 临时实例（用完即弃） | 持久化存储 |
| 示例 | 读取 GeoJSON 的 features | 注册数据源到数据库 |

### Factory Pattern 的优势

```typescript
// ❌ 没有工厂：调用者需要知道具体类型
let accessor;
if (type === 'geojson') {
  accessor = new GeoJSONAccessor(path);
} else if (type === 'shapefile') {
  accessor = new ShapefileAccessor(path);
}

// ✅ 使用工厂：调用者只需提供配置
const accessor = DataAccessorFactory.createAccessor({
  type: 'geojson',
  reference: path
});
```

### 基于 Accessor 的实现（impl/）

`accessors/impl/` 目录包含更细粒度的实现：
- `geojson/GeoJSONBasedAccessor.ts`：通用的 GeoJSON 基础实现
- `shapefile/ShapefileBasedAccessor.ts`：通用的 Shapefile 基础实现
- `postgis/PostGISBasedAccessor.ts`：通用的 PostGIS 基础实现

这些基类可以被具体的访问器继承，减少代码重复。
