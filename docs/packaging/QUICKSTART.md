# GeoAI-UP 快速开始指南

## 系统要求

- Windows 10/11 (64位)
- 至少4GB可用内存
- 至少2GB可用磁盘空间

## 首次使用

### 1. 解压文件

将下载的 `package.zip` 文件解压到任意目录，例如：
```
D:\GeoAI-UP\
```

### 2. 配置环境（可选）

如果需要修改默认配置，可以编辑 `.env` 文件：

```env
# 工作区目录（存储插件、数据等）
WORKSPACE_DIR=./workspace

# 服务端口
PORT=3000

# LLM配置（根据使用的模型提供商填写）
LLM_PROVIDER=openai
LLM_API_KEY=your-api-key-here
LLM_MODEL=gpt-4
```

### 3. 启动应用

双击运行 `start.bat` 文件。

首次启动时，控制台会显示类似以下信息：
```
========================================
  GeoAI-UP Geographic AI Assistant
========================================

Starting GeoAI-UP server...

Serving static files from: .\client
Initializing storage layer...
Scanning data directory for existing files...
Initializing cleanup scheduler...
Cleanup scheduler started
Initializing plugin system...
Plugin system initialized with 0 plugins
Registering plugin executors...
Executor registration complete
Registering plugin capabilities...
Plugin capability registration complete
GeoAI-UP Server running on http://localhost:3000
```

### 4. 访问应用

打开浏览器，访问：
```
http://localhost:3000
```

## 基本功能

### 数据上传

1. 点击左侧菜单的"数据管理"
2. 点击"上传文件"按钮
3. 支持的文件格式：
   - Shapefile (.shp, .shx, .dbf, .prj)
   - GeoJSON (.geojson, .json)
   - GeoTIFF (.tif, .tiff)
   - CSV (.csv)

### 对话分析

1. 点击左侧菜单的"智能对话"
2. 在对话框中输入您的问题，例如：
   - "显示所有公园的位置"
   - "计算各区域的面积"
   - "创建热力图显示人口密度"

### 可视化展示

系统会自动将分析结果以地图形式展示，支持：
- 图层切换
- 缩放和平移
- 属性查询
- 样式调整

## 常见问题

### Q: 启动时提示端口被占用？

A: 修改 `.env` 文件中的 `PORT` 为其他端口号，如 `3001`。

### Q: 如何停止服务？

A: 在命令行窗口按 `Ctrl+C`，或直接关闭窗口。

### Q: 数据保存在哪里？

A: 所有数据保存在 `workspace` 目录下，包括：
- `workspace/data/` - 上传的数据文件
- `workspace/results/` - 分析结果
- `workspace/plugins/` - 插件文件
- `workspace/database/` - 数据库文件

### Q: 如何备份数据？

A: 直接复制整个 `workspace` 目录即可备份所有数据。

### Q: 支持哪些LLM模型？

A: 目前支持：
- OpenAI (GPT-3.5, GPT-4)
- Anthropic (Claude)
- 其他兼容OpenAI API的模型

## 技术支持

如遇到问题，请检查：
1. 控制台输出的错误信息
2. 浏览器控制台的错误信息
3. `.env` 配置是否正确

## 更新应用

1. 备份 `workspace` 目录
2. 下载新版本并解压
3. 将备份的 `workspace` 目录复制到新版本中
4. 重新启动应用