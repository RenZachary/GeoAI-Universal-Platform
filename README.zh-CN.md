# GeoAI-UP - 开箱即用的 GIS 应用智能体

<div align="center">

**用自然语言驱动的智能空间分析平台**

[![Node.js](https://img.shields.io/badge/node-%5E20.19.0%20%7C%7C%20%3E%3D22.12.0-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5+-brightgreen.svg)](https://vuejs.org/)
[![LangChain](https://img.shields.io/badge/LangChain-Integrated-orange.svg)](https://langchain.com/)
[![Blog](https://img.shields.io/badge/Blog-CSDN-red.svg)](https://blog.csdn.net/eqmaster)

</div>

---

## 🌟 产品概述

**GeoAI-UP** 是一款**开箱即用的 GIS 应用智能体**，将大语言模型（LLM）与先进的空间分析能力深度融合。只需用自然语言描述您的地理空间分析需求，AI 智能体即可自动规划、执行并可视化呈现结果。

![首页](https://foruda.gitee.com/images/1778104634845045889/691faa01_790454.png "首页")

> ⚠️ **项目状态**：GeoAI-UP 目前处于**积极开发阶段**。虽然核心功能已可运行，但在架构优化和功能扩展过程中，您可能会遇到不完善之处或已知问题。我们非常欢迎您通过 [Issues](https://gitee.com/rzcgis/geo-ai-universal-platform/issues) 提供反馈和贡献。

任何问题请提[Issue](https://gitee.com/rzcgis/geo-ai-universal-platform/issues)，统一回复，其他地方概不回复，请谅解。

### 核心优势

🎯 **开箱即用** - 无需复杂配置，立即开始空间分析  
🚀 **MVT + WMS 可视化** - 原生支持大数据量渲染，动态瓦片服务  
✨ **自然语言交互** - 用日常语言描述任务，无需 GIS 专业知识  
🤖 **AI 驱动工作流** - 基于 LangGraph 的智能任务编排  
🔌 **可扩展插件** - 支持自定义插件开发  
📊 **多格式支持** - Shapefile、GeoJSON、PostGIS、GeoTIFF  

---

## 🎯 应用场景

### 场景一：空间分析
> "为所有河流创建 500 米缓冲区，并计算总面积"

GeoAI-UP 自动完成：
- 识别河流数据源
- 使用 Turf.js 执行缓冲区分析
- 计算统计数据
- 在交互式地图上可视化结果

### 场景二：热力图生成
> "从这个点数据集生成人口密度热力图"

系统自动：
- 分析数据 schema
- 应用核密度估计（KDE）算法
- 生成动态 MVT 瓦片
- 渲染精美的热力图可视化

### 场景三：栅格数据显示
> "在地图上显示这个 GeoTIFF 卫星影像"

GeoAI-UP 自动：
- 提取地理参考元数据
- 即时创建 WMS 服务
- 实现高效瓦片渲染
- 支持多波段 RGB 合成

---

## 🚀 核心功能

### 智能 AI 助手
- **目标拆分**：将复杂请求分解为可管理的子任务
- **任务规划**：使用 LangGraph 状态机生成可执行工作流
- **上下文感知**：理解数据 schema 和可用插件
- **对话记忆**：在多次交互中保持上下文
- **流式输出**：实时逐 token 响应生成
- **自动报告生成**：自动生成包含可视化和洞察的综合分析报告

### 全面的空间分析
- **缓冲区分析**：创建要素周围的距离区域
- **叠加分析**：交集、并集、差集运算
- **统计分析**：聚合、过滤、汇总计算
- **热力图生成**：点模式核密度估计
- **分级统计图**：统计分类和专题制图

### 高级可视化 - MVT + WMS
- **动态 MVT 发布**：按需生成矢量瓦片，支持海量数据
- **WMS 服务创建**：实时栅格数据服务，高效缓存
- **大数据就绪**：原生支持大规模空间数据渲染
- **多种渲染器**：统一色彩、分类、分级符号、热力图
- **交互式地图**：MapLibre GL JS，百万级要素流畅缩放平移

### 灵活的数据访问
- **Shapefile 支持**：完整解析 .shp/.dbf/.shx 文件
- **GeoJSON 处理**：原生 JSON 格式空间数据
- **PostGIS 集成**：直接访问 PostgreSQL/PostGIS 数据库
- **GeoTIFF 处理**：带坐标系统的多波段栅格数据
- **自动扫描**：启动时自动检测并注册数据文件

### 可扩展插件架构
- **自定义插件支持**：开发和部署专属分析工具
- **热加载**：无需重启服务器即可加载插件
- **自动发现**：与 LangChain 工具无缝集成

### 现代化 Web 界面
- **对话界面**：与 AI 助手进行自然语言交互
- **数据管理**：浏览、上传和管理空间数据集
- **插件管理器**：安装、配置和监控插件
- **模板系统**：保存和重用提示词模板
- **设置面板**：配置 LLM 提供商和系统偏好

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端层 (Vue 3)                          │
│  对话界面 | 数据管理 | 地图视图 | 插件管理                    │
└───────────────────────┬─────────────────────────────────────┘
                        │ RESTful API + SSE
┌───────────────────────▼─────────────────────────────────────┐
│                  后端层 (Express + TypeScript)               │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         LLM 交互层 (LangChain)                      │    │
│  │  目标拆分器 → 任务规划器 → 执行器 → 总结生成器       │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │        插件编排层                                   │    │
│  │  工具封装 → 执行器注册表 → 结果处理器               │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐   │
│  │数据访问层     │ │空间分析层     │ │可视化服务层       │   │
│  └──────────────┘ └──────────────┘ └──────────────────┘   │
└───────────────────────────┬────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│                    存储层                                    │
│  文件系统 | SQLite 数据库 | 工作区 | 临时文件                │
└────────────────────────────────────────────────────────────┘
```

### 技术栈

**后端：**
- Node.js 20.19+ / 22.12+
- Express 5.x + TypeScript
- LangChain & LangGraph（AI 工作流）
- SQLite（better-sqlite3）元数据存储
- PostgreSQL/PostGIS 支持

**GIS 库：**
- GDAL（gdal-async）- 栅格数据处理
- Turf.js - 矢量空间分析
- Proj4 - 坐标转换
- GeoTIFF.js - TIFF 影像读取
- geojson-vt & vt-pbf - 矢量瓦片生成

**前端：**
- Vue 3.5+ Composition API
- Element Plus UI 组件库
- Pinia 状态管理
- MapLibre GL JS 地图引擎
- Vue I18n 国际化

---

## 📦 安装指南

### 快速开始

```bash
# 克隆仓库
git clone https://gitee.com/rzcgis/geo-ai-universal-platform.git
cd geo-ai-universal-platform

# 安装依赖
npm install

# 配置环境
cp server/.env.example server/.env
# 编辑 server/.env，填入您的 LLM API 密钥

# 启动应用
npm run dev:server   # 终端 1：后端服务
npm run dev:web      # 终端 2：前端服务
```

访问 `http://localhost:5173`

### 独立安装包（Windows）

创建包含嵌入式 Node.js 运行时的便携包：

```bash
npm run package
```

生成的 `package/` 目录包含：
- 嵌入式 Node.js 运行时
- 编译后的应用程序
- 启动脚本（`start.bat`）

复制到任意 Windows 机器，运行 `start.bat` 即可 - 无需安装任何依赖！

---

## 📖 使用指南

### 1. 上传数据

进入**数据管理**页面：
- 拖拽上传 Shapefile (.shp)、GeoJSON 或 GeoTIFF 文件
- 文件自动扫描并注册
- 查看元数据：范围、坐标系、字段 schema

### 2. 开始对话

进入**聊天**页面，描述您的分析目标：

```
用户："我有一个城市 shapefile，能帮我找出人口超过 100 万的城市吗？"

AI：我将帮您按人口筛选城市。首先检查数据 schema...
    
    [分析数据源...]
    [执行过滤操作...]
    [生成可视化...]
    
    以下是 15 个人口超过 100 万的城市：
    [交互式地图显示筛选结果]
```

### 3. 探索结果

- **地图视图**：平移、缩放、点击要素查看属性
- **图层控制**：切换可见性、调整透明度
- **图例**：理解配色方案和分类
- **下载**：导出结果为 GeoJSON 等格式

### 4. 管理插件

访问**插件管理器**：
- 查看已安装插件及其状态
- 从工作区目录安装自定义插件
- 启用/禁用特定功能
- 监控插件执行日志

---

## 🔌 自定义插件

GeoAI-UP 支持自定义插件开发。只需实现插件接口并将其放置在 `workspace/plugins/` 目录中，系统启动时会自动发现并注册插件。

---

## 📁 项目结构

```
geoai-up/
├── server/                 # 后端应用（Express + TypeScript）
├── web/                    # 前端应用（Vue 3）
├── docs/                   # 文档
└── workspace/              # 运行时数据（插件、结果、配置）
```

---

## 📚 文档

完整文档位于 `docs/` 目录：

- **[架构设计](docs/architecture/OVERALL-DESIGN.md)** - 系统架构和设计决策
- **[API 规范](docs/architecture/API-SPECIFICATION.md)** - 完整 API 参考
- **[插件系统](docs/architecture/PLUGIN-SYSTEM-DESIGN.md)** - 插件开发指南
- **[实现指南](docs/implementation/)** - 分步功能实现说明
- **[数据库设计](docs/architecture/DATABASE-DESIGN.md)** - 数据库结构和迁移

---

## 🤝 贡献指南

欢迎贡献！Fork 仓库，创建功能分支，提交 Pull Request。

---

## 🙏 致谢

基于优秀的开源技术构建：

- [LangChain](https://langchain.com/) - LLM 编排框架
- [MapLibre GL JS](https://maplibre.org/) - 交互式地图
- [Turf.js](https://turfjs.org/) - 地理空间分析
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Element Plus](https://element-plus.org/) - UI 组件库

---

<div align="center">

**为地理空间社区用心打造 ❤️**

[官方网站](https://gitee.com/rzcgis/geo-ai-universal-platform) | [文档](docs/)

</div>
