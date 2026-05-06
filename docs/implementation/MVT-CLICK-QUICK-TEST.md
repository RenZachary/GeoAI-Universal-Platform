# 快速测试 MVT 图层点击功能

## 测试步骤

### 1. 启动应用
```bash
# 终端 1 - 启动后端
cd server
npm run dev

# 终端 2 - 启动前端
cd web
npm run dev
```

### 2. 打开浏览器控制台
- 按 `F12` 打开开发者工具
- 切换到 **Console** 标签
- 保持控制台打开状态

### 3. 添加图层
1. 访问 http://localhost:5173
2. 进入聊天界面
3. 输入："显示陕西省市级行政区划数据"
4. 等待处理完成
5. 切换到 **Map** 标签

### 4. 检查图层状态
在控制台中输入：
```javascript
// 查看所有图层
console.log('总图层数:', mapStore.layers.length)
console.log('可见图层数:', mapStore.visibleLayers.length)

// 列出所有图层详情
mapStore.layers.forEach(l => {
  console.log(`图层: ${l.name || l.id}, 类型: ${l.type}, 可见: ${l.visible}`)
})
```

**期望输出**：
```
总图层数: X
可见图层数: Y (至少为1)
图层: 陕西省市级行政区划, 类型: mvt, 可见: true
```

### 5. 确保图层可见
- 点击右上角的 **Layers** 按钮
- 找到 "陕西省市级行政区划" 图层
- 确保复选框已勾选（visible = true）
- 地图上应该能看到多边形

### 6. 点击地图要素
1. 点击地图上的任意多边形（市级行政区）
2. 观察控制台输出

**期望的控制台输出**：
```
[MapWorkspace] Map clicked at: LngLat {lng: 108.xxx, lat: 34.xxx}
[MapWorkspace] Has queryable layers: true
[MapWorkspace] Total layers: X
[MapWorkspace] Visible layers: Y
[MapWorkspace] Querying features at: [108.xxx, 34.xxx]
[Map Store] Querying 2 sub-layers for layer-xxx
[MapWorkspace] Found features: 1
[MapWorkspace] Showing popup with 1 features
```

### 7. 验证弹窗显示
- 应该在点击位置附近看到一个弹窗
- 弹窗标题：**Feature Information** / **要素信息**
- 内容：显示该行政区的属性信息（如名称、代码等）
- 可以点击 **X** 关闭弹窗

## 常见问题排查

### 问题 1: 点击后没有任何控制台输出
**原因**: 点击事件未绑定

**解决**:
```javascript
// 检查地图实例
console.log('Map instance:', mapStore.mapInstance)

// 如果为 null，刷新页面重试
```

### 问题 2: 显示 "Has queryable layers: false"
**原因**: 没有可见的 MVT/GeoJSON 图层

**解决**:
1. 打开 Layer Management 面板
2. 勾选至少一个图层
3. 确认图层类型是 `mvt` 或 `geojson`

### 问题 3: 显示 "Found features: 0"
**原因**: 点击位置没有要素，或缩放级别不合适

**解决**:
1. 尝试放大地图（zoom in）
2. 点击不同的区域
3. 确认图层确实有数据

**手动测试查询**:
```javascript
// 获取地图中心点
const center = mapStore.mapInstance.getCenter()
const features = mapStore.queryFeaturesAtPoint([center.lng, center.lat])
console.log('查询结果:', features)
```

### 问题 4: 找到要素但弹窗不显示
**原因**: Vue 组件渲染问题

**解决**:
```javascript
// 检查弹窗状态
console.log('显示弹窗:', showFeaturePopup.value)
console.log('弹窗数据:', popupFeatures.value)
console.log('弹窗位置:', popupPosition.value)

// 如果 showFeaturePopup 是 false，手动设置为 true
showFeaturePopup.value = true
```

### 问题 5: 弹窗显示但没有属性
**原因**: MVT 瓦片不包含属性数据

**检查**:
```javascript
const features = mapStore.queryFeaturesAtPoint([108.9, 34.3]) // 替换为实际坐标
console.log('要素属性:', features.map(f => f.properties))
```

如果 properties 是空对象 `{}`，说明后端 MVT 服务没有包含属性。这是后端问题，需要检查数据源。

## 调试命令汇总

```javascript
// 1. 检查所有图层
mapStore.layers.forEach(l => console.log(l.id, l.type, l.visible))

// 2. 检查可见图层
mapStore.visibleLayers.forEach(l => console.log(l.id, l.type))

// 3. 检查地图实例
console.log('Map ready:', !!mapStore.mapInstance)

// 4. 手动查询要素
const center = mapStore.mapInstance.getCenter()
const features = mapStore.queryFeaturesAtPoint([center.lng, center.lat])
console.log('Features found:', features.length, features)

// 5. 检查 MapLibre 原生图层
const style = mapStore.mapInstance.getStyle()
style.layers.forEach(l => console.log(l.id, l.source, l.type))

// 6. 重置弹窗状态
showFeaturePopup.value = false
popupFeatures.value = []
```

## 成功的标志

✅ 控制台显示完整的日志流  
✅ "Found features: X" (X > 0)  
✅ 弹窗在地图上显示  
✅ 弹窗中包含要素属性  
✅ 可以点击 X 关闭弹窗  

## 如果仍然不工作

请提供以下信息：

1. **控制台完整输出**（截图或复制文本）
2. **网络请求**（Network 标签中 MVT 请求的状态）
3. **图层列表**（`mapStore.layers` 的输出）
4. **浏览器版本**（Chrome/Firefox 版本号）

这样可以更准确地定位问题。
