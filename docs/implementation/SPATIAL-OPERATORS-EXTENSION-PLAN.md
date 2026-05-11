# 空间分析算子扩展规划

**文档版本**: v1.0  
**创建日期**: 2026-05-11  
**状态**: 规划阶段  

---

## 📋 概述

本文档规划 GeoAI-UP 项目中需要补充实现的空间分析算子（Spatial Operators），基于现有架构约束和能力评估。

### 架构约束

1. **网络分析/连通性分析**：仅在 PostGIS Backend 中实现（依赖 pgRouting 扩展）
2. **三维分析**：暂不考虑（视域分析、3D 体积计算等）
3. **双后端支持**：优先实现同时支持 VectorBackend（GeoJSON/Shapefile）和 PostGISBackend 的算子
4. **能力不对称处理**：若某算子在某后端难以实现，可仅在后端支持，并在 Operator 层面做数据源类型检查

---

## ✅ 已实现的算子

当前 `server/src/spatial-operators/operators/analysis/` 目录下已有：

| 算子名称 | 功能描述 | 后端支持 |
|---------|---------|---------|
| **BufferOperator** | 缓冲区分析 | ✅ Vector + PostGIS |
| **OverlayOperator** | 叠加分析（交并差） | ✅ Vector + PostGIS |
| **FilterOperator** | 属性/空间过滤 | ✅ Vector + PostGIS |
| **AggregationOperator** | 聚合统计（MAX/MIN/AVG/SUM/COUNT/TOP_N） | ✅ Vector + PostGIS |
| **StatisticsCalculatorOperator** | 描述性统计（均值/中位数/标准差等） | ✅ Vector + PostGIS |

---

## 🔥 Phase 1: 高优先级 - 核心基础算子（立即实现）

### 1. SpatialJoinOperator（空间连接）⭐⭐⭐

**功能描述**：
- 基于空间关系（Intersects, Within, Contains, Touches, Crosses, Overlaps）关联两个数据集的属性
- 支持 Inner Join、Left Join、Right Join

**典型应用场景**：
- "将人口统计数据连接到对应的行政区多边形"
- "统计每个商圈内的 POI 数量"
- "找出与河流相交的所有道路"

**后端实现方案**：

**PostGIS Backend**：
- ✅ 已有 `PostGISSpatialJoinOperation.ts` 实现
- 使用 SQL JOIN + 空间谓词（ST_Intersects, ST_Within 等）
- 性能优异，支持大规模数据

**Vector Backend**：
- ⚠️ Turf.js 无直接的空间连接函数
- 需手动实现：遍历要素对，使用 Turf.js 的空间判断函数（intersect, within 等）
- 性能较差，适合小规模数据（< 1000 要素）

**实施建议**：
- 优先封装现有的 `PostGISSpatialJoinOperation` 为 Operator
- VectorBackend 可作为降级方案，但需在文档中标注性能限制

---

### 2. ProximityOperator（邻近度分析）⭐⭐⭐

**功能描述**：
- 计算要素间的距离矩阵
- 查找最近邻要素（Nearest Neighbor）
- 距离带分析（Distance Bands）

**典型应用场景**：
- "找出每个学校最近的医院"
- "计算所有小区到地铁站的距离"
- "生成距离市中心不同范围的环形区域"

**后端实现方案**：

**PostGIS Backend**：
- ✅ 使用 `ST_Distance()` 计算距离
- ✅ 使用 `<->` KNN 运算符进行高效最近邻查询
- ✅ 使用 `ST_DWithin()` 进行距离范围内的筛选

**Vector Backend**：
- ✅ 使用 Turf.js `distance()` 计算两点距离
- ✅ 使用 Turf.js `nearestPoint()` 查找最近点
- ⚠️ 大规模数据需优化（避免 O(n²) 复杂度）

**实施建议**：
- 两后端均易实现，优先完成
- PostGIS 版本应利用空间索引加速

---

### 3. DensityAnalysisOperator（密度分析）⭐⭐⭐

**功能描述**：
- 核密度估计（Kernel Density Estimation, KDE）
- 生成点密度热力图

**典型应用场景**：
- "生成犯罪事件的热力图"
- "显示餐厅分布密度"
- "可视化交通事故高发区域"

**后端实现方案**：

**PostGIS Backend**：
- ⚠️ 原生不支持 KDE，需安装 `pg_kde` 扩展或编写自定义 SQL
- 替代方案：在应用层计算后存入 PostGIS

**Vector Backend**：
- ✅ 可集成 `kde.js` 或 `heatmap.js` npm 包
- ✅ 项目已有 HeatmapExecutor 逻辑，可复用

**实施建议**：
- 整合现有的 HeatmapExecutor 为标准化的 DensityAnalysisOperator
- 初期优先实现 VectorBackend 版本
- PostGIS 版本可作为后续优化项

---

## 🟡 Phase 2: 中优先级 - 常用工具算子（短期实现）

### 4. CentroidOperator（质心/重心计算）⭐⭐

**功能描述**：
- 计算多边形的几何质心（Centroid）
- 计算加权重心（Weighted Mean Center）
- 标准差椭圆（Standard Deviational Ellipse）- 可选

**典型应用场景**：
- "计算每个行政区的几何中心用于标注"
- "找出人口分布的重心位置"
- "分析城市扩张的方向趋势"

**后端实现方案**：

**PostGIS Backend**：
- ✅ 使用 `ST_Centroid()` 计算几何质心
- ✅ 使用 `ST_PointOnSurface()` 获取多边形内部点
- ⚠️ 加权重心需自定义 SQL

**Vector Backend**：
- ✅ 使用 Turf.js `centroid()` 计算质心
- ✅ 使用 Turf.js `centerOfMass()` 计算质量中心

**实施建议**：
- 简单易实现，两后端对称性好
- 可作为入门级算子快速完成

---

### 5. ConvexHullOperator（凸包计算）⭐⭐

**功能描述**：
- 计算点集的凸包（Convex Hull）
- 最小外接矩形（Minimum Bounding Rectangle）
- 最小外接圆（Minimum Bounding Circle）

**典型应用场景**：
- "找出配送范围的最小覆盖区域"
- "计算事件发生区域的边界"
- "简化复杂点集的表示"

**后端实现方案**：

**PostGIS Backend**：
- ✅ 使用 `ST_ConvexHull()` 计算凸包
- ✅ 使用 `ST_Envelope()` 获取外接矩形
- ✅ 使用 `ST_MinimumBoundingCircle()` 获取外接圆

**Vector Backend**：
- ✅ 使用 Turf.js `convex()` 计算凸包
- ✅ 使用 Turf.js `bbox()` 获取边界框

**实施建议**：
- 两后端均有成熟实现，难度低
- 可作为几何处理的基础算子

---

### 6. GeometryRepairOperator（几何修复）⭐⭐

**功能描述**：
- 修复自相交多边形（Self-intersection）
- 简化/抽稀几何（Douglas-Peucker 算法）
- 平滑曲线（Curve Smoothing）
- 清理无效坐标

**典型应用场景**：
- "修复导入失败的 Shapefile 几何错误"
- "简化复杂边界以提高渲染性能"
- "清理 GPS 轨迹中的噪声点"

**后端实现方案**：

**PostGIS Backend**：
- ✅ 使用 `ST_MakeValid()` 修复无效几何
- ✅ 使用 `ST_Simplify()` 简化几何
- ✅ 使用 `ST_SnapToGrid()` 清理精度问题

**Vector Backend**：
- ✅ 使用 Turf.js `cleanCoords()` 清理坐标
- ✅ 使用 Turf.js `simplify()` 简化几何
- ⚠️ 自相交修复需额外库支持

**实施建议**：
- 作为数据质量保障工具，实用性高
- PostGIS 版本功能更强大

---

## 🔵 Phase 3: 低优先级 - 专业分析算子（中期规划）

### 7. InterpolationOperator（插值分析）⭐⭐

**功能描述**：
- 反距离权重插值（IDW - Inverse Distance Weighting）
- 克里金插值（Kriging）- 复杂，可选
- 样条插值（Spline）- 可选

**典型应用场景**：
- "根据气象站数据生成温度分布图"
- "从采样点估算土壤污染浓度"
- "创建连续的表面模型"

**后端实现方案**：

**PostGIS Backend**：
- ❌ 原生不支持插值算法
- 需依赖外部工具或扩展

**Vector Backend**：
- ✅ 可集成 `idw-interpolation` npm 包
- ⚠️ Kriging 需要复杂的统计学库

**实施建议**：
- 初期仅实现 IDW（最简单且常用）
- Kriging 留待后期，需评估必要性

---

### 8. ClusteringOperator（聚类分析）⭐⭐

**功能描述**：
- DBSCAN 空间聚类（基于密度）
- K-Means 聚类（基于距离）
- 热点分析（Getis-Ord Gi*）- 可选

**典型应用场景**：
- "识别犯罪高发区域"
- "发现相似的社区类型"
- "自动分组空间上聚集的要素"

**后端实现方案**：

**PostGIS Backend**：
- ✅ 使用 `ST_ClusterDBSCAN()` 进行 DBSCAN 聚类
- ✅ 使用 `ST_ClusterKMeans()` 进行 K-Means 聚类
- ⚠️ 热点分析需自定义 SQL

**Vector Backend**：
- ✅ 可集成 `dbSCAN` 或 `ml-kmeans` npm 包
- ⚠️ 需手动实现空间距离计算

**实施建议**：
- PostGIS 版本有原生支持，优先实现
- VectorBackend 版本可作为备选

---

### 9. ZonalStatisticsOperator（分区统计）⭐

**功能描述**：
- 在矢量区域内统计栅格数据的值（均值、总和、最大值、最小值等）
- 结合矢量和栅格数据的组合分析

**典型应用场景**：
- "统计每个行政区的平均高程"
- "计算流域内的总降水量"
- "分析不同土地利用类型的 NDVI 均值"

**后端实现方案**：

**PostGIS Backend**：
- ⚠️ 需要安装 `PostGIS Raster` 扩展
- 使用 `ST_SummaryStats()` 等栅格函数

**Vector Backend**：
- ⚠️ 需要结合 GeoTIFFAccessor 读取栅格数据
- 需实现矢量-栅格叠加分析逻辑

**实施建议**：
- 依赖栅格支持，复杂度较高
- 可作为高级功能延后实现

---

## ❌ 暂不实现的算子

### 10. ViewshedOperator（视域分析）

**原因**：
- 需要 DEM（数字高程模型）数据
- 属于三维/地形分析范畴
- 计算复杂度高，专业性太强

**建议**：纳入未来三维分析模块规划

---

### 11. HydrologyOperator（水文分析）

**原因**：
- 需要专门的水文分析库（如 WhiteboxTools、TauDEM）
- 专业性极强，非通用需求
- 涉及流向、汇流累积量、流域提取等复杂算法

**建议**：如有特定用户需求再考虑

---

### 12. NetworkAnalysisOperator（网络分析）

**特殊说明**：
- ✅ **仅在 PostGIS Backend 中实现**
- 依赖 `pgRouting` 扩展
- 包括：最短路径、服务区分析、车辆路径问题等

**原因**：
- VectorBackend（Turf.js）无网络分析能力
- 本地文件无法高效构建拓扑关系
- PostGIS + pgRouting 是行业标准方案

**实施策略**：
- 在 Operator 层面检查数据源类型
- 若非 PostGIS 数据源，抛出友好错误提示："网络分析仅支持 PostGIS 数据源"

---

## 📊 后端支持对比总表

| 算子名称 | PostGIS Backend | Vector Backend | 优先级 | 备注 |
|---------|----------------|----------------|--------|------|
| **SpatialJoin** | ✅ ST_Intersects + JOIN | ⚠️ 需手动实现 | ⭐⭐⭐ | 已有 PostGIS 实现 |
| **Proximity** | ✅ ST_Distance + KNN | ✅ Turf.distance | ⭐⭐⭐ | 两后端均易实现 |
| **Density(KDE)** | ⚠️ 需扩展 | ✅ kde.js | ⭐⭐⭐ | 整合现有 Heatmap |
| **Centroid** | ✅ ST_Centroid | ✅ Turf.centroid | ⭐⭐ | 简单实用 |
| **ConvexHull** | ✅ ST_ConvexHull | ✅ Turf.convex | ⭐⭐ | 基础几何操作 |
| **GeometryRepair** | ✅ ST_MakeValid | ✅ Turf.cleanCoords | ⭐⭐ | 数据质量保障 |
| **Interpolation(IDW)** | ❌ | ✅ idw-interpolation | ⭐⭐ | 仅实现 IDW |
| **Clustering** | ✅ ST_ClusterDBSCAN | ✅ dbSCAN | ⭐⭐ | PostGIS 优先 |
| **ZonalStats** | ⚠️ 需Raster扩展 | ⚠️ 需栅格支持 | ⭐ | 延后实现 |
| **NetworkAnalysis** | ✅ pgRouting | ❌ 不支持 | N/A | 仅 PostGIS |
| **Viewshed** | ❌ | ❌ | ❌ | 暂不实现 |
| **Hydrology** | ❌ | ❌ | ❌ | 暂不实现 |

---

## 🎯 实施路线图

### Phase 1: 核心基础（1-2 周）
**目标**：补齐最常用的空间分析能力

1. ✅ **SpatialJoinOperator**
   - 封装现有的 `PostGISSpatialJoinOperation`
   - 实现 VectorBackend 降级方案
   
2. ✅ **ProximityOperator**
   - 两后端同步实现
   - 重点优化 PostGIS KNN 查询

3. ✅ **DensityAnalysisOperator**
   - 整合现有 HeatmapExecutor 逻辑
   - 标准化输入输出接口

**验收标准**：
- 三个算子均可通过 LLM Planner 调用
- 支持常见的自然语言查询场景
- 单元测试覆盖率 > 80%

---

### Phase 2: 常用工具（2-3 周）
**目标**：提供实用的几何处理和统计分析工具

4. **CentroidOperator**
5. **ConvexHullOperator**
6. **GeometryRepairOperator**

**验收标准**：
- 算子可链式调用（如：Filter → Buffer → Centroid）
- 良好的错误处理和用户提示
- 文档完善，包含使用示例

---

### Phase 3: 专业分析（3-4 周）
**目标**：支持更专业的空间分析需求

7. **InterpolationOperator**（仅 IDW）
8. **ClusteringOperator**
9. **ZonalStatisticsOperator**（可选）

**验收标准**：
- 针对特定领域用户提供价值
- 性能可接受（大数据集有优化方案）
- 清晰的适用范围说明

---

## 💡 关键设计原则

### 1. 保持后端能力透明性

Operator 层面应尽量屏蔽后端差异，但在以下情况需明确标注：
- 某算子仅在某后端可用（如 NetworkAnalysis）
- 某后端性能显著较差（如 VectorBackend 的 SpatialJoin）
- 某后端有额外依赖（如 PostGIS Raster 扩展）

### 2. 友好的错误提示

当用户尝试在不支持的后端执行操作时：
```typescript
// 示例：NetworkAnalysisOperator
if (dataSource.type !== 'postgis') {
  throw new Error(
    '网络分析仅支持 PostGIS 数据源。' +
    '请将您的路网数据导入 PostGIS 数据库后再试。' +
    '参考文档：[链接]'
  );
}
```

### 3. 复用现有实现

- 优先封装已有的 Operation 类（如 `PostGISSpatialJoinOperation`）
- 整合现有的 Executor 逻辑（如 HeatmapExecutor → DensityAnalysisOperator）
- 避免重复开发

### 4. 文档化限制

在每个 Operator 的描述中明确标注：
- 支持的数据源类型
- 性能特征（适合小规模/大规模数据）
- 必要的依赖或前置条件

### 5. 测试驱动开发

每个新算子应包含：
- 单元测试（Mock 后端）
- 集成测试（真实数据源）
- 性能基准测试（大数据集）

---

## 📝 后续工作

### 短期任务（本周）
- [ ] 确认 Phase 1 三个算子的详细设计方案
- [ ] 评估现有 HeatmapExecutor 的可复用性
- [ ] 编写 SpatialJoinOperator 的技术规格文档

### 中期任务（本月）
- [ ] 完成 Phase 1 全部算子实现
- [ ] 更新 LLM Planner 的算子选择逻辑
- [ ] 编写用户文档和使用示例

### 长期任务（季度）
- [ ] 完成 Phase 2 和 Phase 3 算子
- [ ] 性能优化（特别是 VectorBackend 的大数据处理）
- [ ] 考虑引入更多专业分析算子（根据用户反馈）

---

## 🔗 相关文档

- [空间算子架构设计](../architecture/SPATIAL-OPERATIONS-ARCHITECTURE.md)
- [数据访问层架构](../architecture/DATA-ACCESS-LAYER-ARCHITECTURE.md)
- [算子实现指南](../implementation/OPERATOR-IMPLEMENTATION-GUIDE.md)
- [PostGIS 集成文档](../architecture/POSTGIS-INTEGRATION.md)

---

**文档维护者**: GeoAI-UP 开发团队  
**最后更新**: 2026-05-11
