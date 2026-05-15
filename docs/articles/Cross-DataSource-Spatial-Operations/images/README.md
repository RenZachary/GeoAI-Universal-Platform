# 图片资源目录

本目录用于存放文章中的示意图和截图。

## 建议补充的图片

### 1. buffer-result.png
**描述**: 缓冲分析结果可视化截图  
**内容**: MapLibre GL JS渲染的河流500米缓冲区，红色半透明面要素  
**尺寸**: 1200x800px  
**来源**: GeoAI-UP前端地图页面截图

### 2. architecture-comparison.png
**描述**: Backend模式 vs Accessor模式架构对比图  
**内容**: 左右对比的架构图，展示两种模式的差异  
**尺寸**: 1600x900px  
**工具**: Draw.io / Mermaid导出

### 3. performance-chart.png
**描述**: Buffer操作性能对比柱状图  
**内容**: X轴为数据规模，Y轴为耗时（秒），两条曲线分别代表PostGIS和Turf.js  
**尺寸**: 1200x600px  
**工具**: Excel / Chart.js

### 4. cross-source-flow.png
**描述**: 跨源Overlay操作数据流向图  
**内容**: 详细展示GeoJSON导入PostGIS、执行SQL叠加、返回结果的完整流程  
**尺寸**: 1400x1000px  
**工具**: Mermaid序列图导出

### 5. temp-schema-cleanup.png
**描述**: 临时表清理调度器工作流程  
**内容**: 定时任务触发 → 查询过期表 → 删除表 → 清理SQLite元数据  
**尺寸**: 1200x700px  
**工具**: Mermaid流程图导出

---

**注**: 当前文章使用Mermaid代码块直接渲染图表，以上图片为可选补充，用于增强视觉效果。
