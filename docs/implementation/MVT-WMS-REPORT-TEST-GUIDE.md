# MVT/WMS/Report 服务链接修复 - 测试指南

## 快速测试步骤

### 前置条件
1. 确保后端服务器运行在 `http://localhost:3000`
2. 确保前端开发服务器运行在 `http://localhost:5173`
3. 准备测试数据（GeoJSON、GeoTIFF 文件）

---

## 测试场景 1：MVT 服务查看

### 步骤
1. **准备数据**：
   ```bash
   # 上传一个 GeoJSON 文件
   curl -X POST http://localhost:3000/api/upload/single \
     -F "file=@test_data/provinces.geojson"
   ```

2. **生成 MVT**：
   - 打开聊天页面：`http://localhost:5173/chat`
   - 输入："为 provinces.geojson 创建 MVT 瓦片"
   - 等待分析完成

3. **验证服务链接**：
   - 在 AI 回复中应该看到服务链接卡片
   - 按钮文本应该是 **"View on Map"**
   - 图标应该是地图图标 🗺️

4. **点击按钮**：
   - 点击 "View on Map" 按钮
   - 应该自动跳转到地图页面：`http://localhost:5173/map?addLayer=...`

5. **验证地图页面**：
   - 地图页面应该自动加载
   - 图层面板中应该显示新添加的图层
   - 图层名称应该正确显示（例如："Mvt Publisher Service"）
   - 图层应该默认可见（复选框已勾选）
   - 地图上应该能看到矢量数据

6. **验证图层控制**：
   - 取消勾选复选框 → 图层应该隐藏
   - 重新勾选 → 图层应该重新显示
   - 调整透明度滑块 → 图层透明度应该变化

### 预期结果
✅ 按钮显示 "View on Map"  
✅ 点击后跳转到地图页面  
✅ 图层自动添加并可见  
✅ 可以正常控制图层可见性和透明度  

---

## 测试场景 2：WMS/Image 服务查看

### 步骤
1. **准备数据**：
   ```bash
   # 上传一个 GeoTIFF 文件
   curl -X POST http://localhost:3000/api/upload/single \
     -F "file=@test_data/dem.tif"
   ```

2. **生成 WMS**：
   - 在聊天页面输入："为 dem.tif 创建 WMS 服务"
   - 等待分析完成

3. **验证服务链接**：
   - 按钮文本应该是 **"View on Map"**
   - 图标应该是地图图标 🗺️

4. **点击按钮**：
   - 点击 "View on Map"
   - 跳转到地图页面

5. **验证地图页面**：
   - 图层应该以栅格形式显示
   - 图层类型应该是 "image"
   - 可以调整透明度

### 预期结果
✅ WMS 服务正确识别为 image 类型  
✅ 在地图上以栅格图层显示  
✅ 透明度控制正常工作  

---

## 测试场景 3：Report 服务查看

### 步骤
1. **生成报告**：
   - 先运行一些空间分析（如缓冲区分析、统计计算等）
   - 在聊天中输入："生成分析报告"
   - 等待 Report Generator 执行完成

2. **验证服务链接**：
   - 按钮文本应该是 **"View Report"**
   - 图标应该是文档图标 📄

3. **点击按钮**：
   - 点击 "View Report"
   - 应该在**新标签页**打开 HTML 报告

4. **验证报告内容**：
   - 报告应该正确显示
   - 包含分析结果摘要
   - 包含可视化服务链接

### 预期结果
✅ 按钮显示 "View Report"  
✅ 在新标签页打开 HTML 报告  
✅ 报告内容完整且格式正确  

---

## 测试场景 4：GeoJSON 文件下载

### 步骤
1. **运行分析插件**：
   - 在聊天中输入："对 provinces.geojson 进行缓冲区分析"
   - 等待分析完成

2. **验证服务链接**：
   - 按钮文本应该是 **"Download"**
   - 图标应该是文档图标 📄

3. **点击按钮**：
   - 点击 "Download"
   - 浏览器应该触发文件下载
   - 文件名应该是 `{stepId}.geojson`

4. **验证下载文件**：
   - 打开下载的 GeoJSON 文件
   - 验证文件格式正确
   - 验证包含预期的几何数据

### 预期结果
✅ 按钮显示 "Download"  
✅ 触发文件下载  
✅ 下载的文件是有效的 GeoJSON  

---

## 测试场景 5：多图层同时显示

### 步骤
1. **添加第一个 MVT 图层**：
   - 在聊天中为第一个数据集生成 MVT
   - 点击 "View on Map"

2. **返回聊天页面**：
   - 点击浏览器后退按钮或重新导航到聊天页面

3. **添加第二个 MVT 图层**：
   - 为第二个数据集生成 MVT
   - 点击 "View on Map"

4. **验证地图页面**：
   - 两个图层都应该在地图上显示
   - 图层面板中应该列出两个图层
   - 可以分别控制每个图层的可见性

### 预期结果
✅ 可以同时显示多个 MVT 图层  
✅ 每个图层可以独立控制  
✅ 图层不会相互覆盖导致不可见  

---

## 测试场景 6：刷新页面不重复添加

### 步骤
1. **添加图层**：
   - 从聊天页面点击 MVT 服务
   - 验证图层已添加到地图

2. **刷新页面**：
   - 按 F5 或 Ctrl+R 刷新地图页面
   - URL 中的 `?addLayer=...` 参数应该被清除

3. **验证图层状态**：
   - 之前添加的图层应该仍然存在（如果保存在 store 中）
   - **不应该**再次添加相同的图层
   - 控制台不应该有重复添加的警告

### 预期结果
✅ 刷新后 URL 参数被清除  
✅ 不会重复添加相同图层  
✅ 没有错误或警告信息  

---

## 常见问题排查

### 问题 1：点击按钮后没有跳转

**可能原因**：
- 前端路由配置问题
- JavaScript 错误

**排查步骤**：
1. 打开浏览器开发者工具（F12）
2. 查看 Console 是否有错误
3. 检查 Network 标签是否有失败的请求
4. 验证 `window.location.href` 是否正确设置

### 问题 2：地图页面没有自动添加图层

**可能原因**：
- 路由参数解析失败
- JSON 格式错误
- mapStore.addLayer 调用失败

**排查步骤**：
1. 检查 URL 中是否有 `?addLayer=...` 参数
2. 在 Console 中查找 `[MapView] Adding layer from query:` 日志
3. 验证 layerInfo 对象是否正确解析
4. 检查 mapStore.layers 数组是否包含新图层

### 问题 3：图层添加但不可见

**可能原因**：
- 图层 visible 属性为 false
- 瓦片服务返回 404
- 地图视角不在数据范围内

**排查步骤**：
1. 检查图层面板中复选框是否勾选
2. 在 Network 标签中检查瓦片请求是否成功
3. 手动缩放和平移地图查看是否有数据
4. 检查瓦片 URL 是否正确

### 问题 4：按钮文本显示错误

**可能原因**：
- 后端返回的服务类型不正确
- 前端类型判断逻辑有误

**排查步骤**：
1. 在 Console 中打印 service 对象
2. 检查 `service.type` 的值
3. 验证 `getActionText()` 函数的逻辑
4. 检查后端 ServicePublisher 的类型映射

---

## 自动化测试脚本（可选）

```javascript
// 在浏览器 Console 中运行

// 测试 1：验证 MVT 服务按钮文本
const mvtService = {
  id: 'test_mvt',
  type: 'mvt',
  url: '/api/services/mvt/test/{z}/{x}/{y}.pbf',
  metadata: { pluginId: 'mvt_publisher' }
}

console.log('MVT Action Text:', getActionText(mvtService))
// 应该输出: "View on Map"

// 测试 2：验证 Report 服务按钮文本
const reportService = {
  id: 'test_report',
  type: 'report',
  url: '/api/results/reports/report_123.html',
  metadata: { pluginId: 'report_generator' }
}

console.log('Report Action Text:', getActionText(reportService))
// 应该输出: "View Report"

// 测试 3：验证 GeoJSON 服务按钮文本
const geojsonService = {
  id: 'test_geojson',
  type: 'geojson',
  url: '/api/results/test.geojson',
  metadata: {}
}

console.log('GeoJSON Action Text:', getActionText(geojsonService))
// 应该输出: "Download"
```

---

## 测试检查清单

### 功能测试
- [ ] MVT 服务 → View on Map → 跳转地图 → 自动添加图层
- [ ] WMS 服务 → View on Map → 跳转地图 → 自动添加图层
- [ ] Report 服务 → View Report → 新标签页打开
- [ ] GeoJSON 服务 → Download → 文件下载
- [ ] 多图层同时显示
- [ ] 图层可见性切换
- [ ] 图层透明度调整
- [ ] 刷新页面不重复添加

### UI 测试
- [ ] 按钮文本正确显示
- [ ] 图标正确显示（Document vs MapLocation）
- [ ] 成功提示消息显示
- [ ] 错误提示消息显示（如有错误）
- [ ] 图层名称正确显示
- [ ] 图层面板布局正常

### 兼容性测试
- [ ] Chrome 浏览器
- [ ] Firefox 浏览器
- [ ] Safari 浏览器（如可用）
- [ ] Edge 浏览器
- [ ] 移动端浏览器（如可用）

### 性能测试
- [ ] 大数量 MVT 瓦片加载速度
- [ ] 多图层同时渲染性能
- [ ] 页面跳转响应时间
- [ ] 内存使用情况

---

## 测试报告模板

```markdown
## 测试报告 - MVT/WMS/Report 服务链接修复

**测试日期**: YYYY-MM-DD  
**测试人员**: [姓名]  
**环境**: 
- 后端版本: v_x.x.x
- 前端版本: v_x.x.x
- 浏览器: Chrome XX / Firefox XX

### 测试结果汇总
- 总测试用例数: X
- 通过: X
- 失败: X
- 跳过: X

### 详细结果

#### 测试场景 1: MVT 服务查看
- 状态: ✅ PASS / ❌ FAIL
- 备注: [任何问题或观察]

#### 测试场景 2: WMS 服务查看
- 状态: ✅ PASS / ❌ FAIL
- 备注: [...]

#### 测试场景 3: Report 服务查看
- 状态: ✅ PASS / ❌ FAIL
- 备注: [...]

#### 测试场景 4: GeoJSON 下载
- 状态: ✅ PASS / ❌ FAIL
- 备注: [...]

#### 测试场景 5: 多图层显示
- 状态: ✅ PASS / ❌ FAIL
- 备注: [...]

#### 测试场景 6: 刷新不重复
- 状态: ✅ PASS / ❌ FAIL
- 备注: [...]

### 发现的问题
1. [问题描述]
   - 严重程度: 高/中/低
   - 复现步骤: [...]
   - 建议修复: [...]

### 结论
[总体评价和建议]
```

---

## 联系支持

如果在测试过程中遇到问题，请：
1. 记录详细的错误信息
2. 截图或录屏问题现象
3. 提供浏览器 Console 日志
4. 联系开发团队
