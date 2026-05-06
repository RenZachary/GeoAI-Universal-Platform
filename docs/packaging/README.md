# GeoAI-UP 打包系统

## 📦 简介

GeoAI-UP打包系统是一个自动化工具，用于将应用打包成独立的可执行包。打包后的应用包含Node.js运行时环境，用户无需安装Node.js即可运行。

## 🚀 快速开始

### 1. 准备工作

```bash
# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../web
npm install
```

### 2. 执行打包

```bash
# 回到项目根目录
cd ..

# 执行打包
npm run package
```

### 3. 验证结果

```bash
# 验证打包结果
npm run test-package
```

### 4. 测试运行

```bash
# 进入打包目录
cd package

# 启动应用
start.bat
```

## 📁 打包输出

打包完成后，会生成 `package` 目录，包含：

```
package/
├── nodejs/              # Node.js运行时
├── server-dist/         # 编译后的后端代码
├── client/              # 编译后的前端静态文件
├── workspace/           # 工作区数据
├── .env                 # 环境配置
└── start.bat            # Windows启动脚本
```

## ⚙️ 配置说明

### 环境变量

编辑 `.env` 文件配置应用：

```env
# 工作区目录
WORKSPACE_DIR=./workspace

# 服务端口
PORT=3000

# LLM配置
LLM_PROVIDER=openai
LLM_API_KEY=your-api-key
LLM_MODEL=gpt-4
```

### 启动脚本

双击 `start.bat` 即可启动应用，或在命令行中运行：

```batch
start.bat
```

## 🔧 开发命令

```bash
# 开发模式
npm run dev:server    # 启动后端（热重载）
npm run dev:web       # 启动前端（热重载）

# 构建
npm run build:server  # 构建后端
npm run build:web     # 构建前端

# 打包
npm run package       # 执行打包
npm run test-package  # 验证打包
```

## 📖 文档

- [PACKAGE_README.md](./PACKAGE_README.md) - 详细打包说明
- [QUICKSTART.md](./QUICKSTART.md) - 快速开始指南
- [BUILD_SYSTEM.md](./BUILD_SYSTEM.md) - 打包系统技术文档

## ❓ 常见问题

### Q: 打包需要多长时间？

A: 首次打包约5-10分钟（取决于网络速度），后续打包约2-3分钟。

### Q: 打包后的文件大小是多少？

A: 约300-500MB，主要包含Node.js运行时和所有依赖。

### Q: 可以在其他操作系统上运行吗？

A: 当前版本仅支持Windows系统。

### Q: 如何更新应用？

A: 备份 `workspace` 目录，重新打包，然后恢复数据。

## 🛠️ 技术要求

- Node.js 20.19.0 或更高版本
- Windows 10/11 (64位)
- 至少4GB内存
- 至少2GB磁盘空间

## 📝 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📧 联系方式

如有问题，请提交Issue或联系开发团队。