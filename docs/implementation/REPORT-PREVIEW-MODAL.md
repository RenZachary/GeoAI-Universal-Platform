# Report Preview Modal - 改进的报告查看体验

## 问题描述

之前点击 "View Report" 按钮会直接在新标签页打开 `.md` 文件，导致浏览器下载文件而不是渲染显示，用户体验不佳。

## 解决方案

创建了内联 Markdown 预览弹窗，在聊天界面内直接渲染报告内容，提供更好的阅读体验。

## 实现细节

### 1. 新增组件：ReportPreviewModal.vue

**位置**: `web/src/components/chat/ReportPreviewModal.vue`

**功能特性**:
- ✅ **优雅弹窗**: 使用 Element Plus Dialog，宽度80%，居中显示
- ✅ **Markdown 渲染**: 使用 `marked` 库实时渲染 Markdown 为 HTML
- ✅ **加载状态**: 显示加载动画，提升用户体验
- ✅ **错误处理**: 网络错误时显示友好提示和重试按钮
- ✅ **样式优化**: 
  - GitHub 风格的 Markdown 样式
  - 代码块、表格、引用等元素美化
  - 响应式设计，支持滚动
- ✅ **下载功能**: 保留原始下载按钮，方便用户保存文件

**技术实现**:
```typescript
// 使用 marked 库安全渲染
const renderedContent = computed(() => {
  if (!rawContent.value) return ''
  return marked(rawContent.value, {
    breaks: true,  // 支持换行
    gfm: true      // GitHub Flavored Markdown
  })
})
```

### 2. 修改 MessageBubble.vue

**变更**:
- 导入 `ReportPreviewModal` 组件
- 添加弹窗状态管理 (`showReportModal`, `currentReportUrl`, `currentReportTitle`)
- 修改 `handleViewService` 函数，点击报告时打开弹窗而非新标签页

**代码片段**:
```typescript
else if (service.type === VisualizationServiceType.Report) {
  // For reports, open preview modal
  currentReportUrl.value = service.url.startsWith('http') 
    ? service.url 
    : `${window.location.origin}${service.url}`
  currentReportTitle.value = service.metadata?.title || 'Report Preview'
  showReportModal.value = true
}
```

### 3. 后端支持：ResultController.ts

**变更**: 添加 `.md` 文件的 MIME 类型支持

```typescript
case '.md':
case '.markdown':
  contentType = 'text/markdown; charset=utf-8';
  break;
```

确保浏览器能正确识别 Markdown 文件类型，避免 CORS 问题。

## 用户体验对比

### Before（旧方式）
```
用户点击 "View Report"
    ↓
浏览器打开新标签页
    ↓
下载 report_xxx.md 文件 ❌
    ↓
用户需要手动用编辑器打开
```

### After（新方式）
```
用户点击 "View Report"
    ↓
在当前页面弹出优雅的预览窗口 ✅
    ↓
自动加载并渲染 Markdown 内容
    ↓
用户可以：
  - 在线阅读（支持滚动）✅
  - 点击下载按钮保存文件 ✅
  - 点击关闭按钮返回聊天 ✅
```

## 样式特点

### Markdown 渲染样式
- **标题**: 清晰的层级结构，带下划线分隔
- **代码块**: 灰色背景，等宽字体，支持语法高亮准备
- **表格**: 斑马纹效果，边框清晰
- **引用**: 左侧蓝色竖线，灰色文字
- **链接**: 主题色，悬停下划线
- **列表**: 适当的缩进和间距

### 弹窗设计
- **尺寸**: 80% 宽度，5vh 顶部边距
- **高度**: 最大 70vh，超出可滚动
- **底部操作栏**: 关闭 + 下载按钮
- **响应式**: 适配不同屏幕尺寸

## 测试建议

1. **基本功能测试**:
   ```
   查询: "五虎林河数据有多少条记录，生成报告"
   等待报告生成完成
   点击 "View Report" 按钮
   验证弹窗正常打开并显示内容
   ```

2. **样式验证**:
   - 检查标题、列表、表格是否正确渲染
   - 验证代码块是否有背景色
   - 确认链接可点击

3. **交互测试**:
   - 点击 "Download .md File" 应触发下载
   - 点击 "Close" 应关闭弹窗
   - 点击遮罩层外部应关闭弹窗

4. **错误处理**:
   - 断开网络后尝试打开报告，应显示错误提示
   - 点击 "Retry" 应重新加载

## 未来优化方向

1. **增强功能**:
   - [ ] 添加打印按钮
   - [ ] 支持缩放调整
   - [ ] 添加目录导航（针对长报告）
   - [ ] 支持暗色模式

2. **性能优化**:
   - [ ] 缓存已加载的报告内容
   - [ ] 懒加载大型报告
   - [ ] 添加骨架屏 loading

3. **交互增强**:
   - [ ] 支持键盘快捷键（ESC 关闭）
   - [ ] 添加复制报告内容按钮
   - [ ] 支持全屏模式

## 相关文件

- `web/src/components/chat/ReportPreviewModal.vue` - 新增组件
- `web/src/components/chat/MessageBubble.vue` - 修改集成
- `server/src/api/controllers/ResultController.ts` - 后端 MIME 类型支持
- `workspace/llm/prompts/en-US/report-generation.md` - 报告模板

## 依赖

前端已安装：
- `marked@^18.0.3` - Markdown 渲染器
- `@types/marked@^5.0.2` - TypeScript 类型定义

无需额外安装依赖。
