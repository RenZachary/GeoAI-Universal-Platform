# Prompt Template Writing Guidelines

提示词模板编写规范，确保 LLM 行为的通用性和避免偏见。

## 🚫 禁止事项

### 1. **禁止使用具体示例**

❌ **错误做法**：
```markdown
Multi-Intent Splitting:
- Example: "统计面积并形成报告" → goal_1 (data_processing), goal_2 (report)
- Example: "显示地图并计算平均值" → goal_1 (visualization), goal_2 (analysis)
```

✅ **正确做法**：
```markdown
Multi-Intent Splitting: If the request contains multiple distinct actions, 
split into separate goals with appropriate types. Each distinct action verb 
typically indicates a separate goal.
```

**原因**：
- 具体示例会导致 LLM 过度拟合到这些特定模式
- LLM 可能会认为只有这些情况才需要拆分，忽略其他类似情况
- 不同语言的示例会造成语言偏见

### 2. **禁止硬编码特定值**

❌ **错误做法**：
```markdown
Use quantile classification by default. For population data, use 5 classes.
For area measurements, use equal_interval method.
```

✅ **正确做法**：
```markdown
Select classification method based on data distribution characteristics and 
user intent. Default to quantile when no specific preference is indicated.
Choose number of classes based on data complexity (typically 3-10).
```

### 3. **禁止特定字段名称**

❌ **错误做法**：
```markdown
Use the 'population' field for choropleth maps.
Reference the 'Shape_Area' field for area calculations.
```

✅ **正确做法**：
```markdown
Identify the appropriate numeric field from data source metadata that matches 
the user's intent. Verify field existence in metadata before referencing.
```

### 4. **禁止特定插件 ID**

❌ **错误做法**：
```markdown
Use the 'choropleth_renderer' plugin for thematic maps.
Call 'aggregation' plugin to calculate statistics.
```

✅ **正确做法**：
```markdown
Select a visualization plugin compatible with polygon data and numeric fields.
Choose a statistical plugin that supports the required aggregation operation.
```

### 5. **禁止中英文混合**

❌ **错误做法**：
```markdown
Multi-Intent Splitting: If request contains multiple actions (如"并", "然后"), 
split into separate goals. When user mentions "报告" or "形成报告", create report goal.
```

✅ **正确做法（英文模板）**：
```markdown
Multi-Intent Splitting: If the request contains multiple distinct actions connected 
by conjunctions (and, then, followed by) or equivalent connectors in any language, 
split into separate goals. When user mentions report-related terms in any language, 
create a separate report type goal.
```

✅ **正确做法（中文模板）**：
```markdown
多意图拆分：如果请求包含多个不同的动作，通过连接词（如“并”、“然后”、“接着”）
或任何语言中的等效连接词连接，拆分为独立的目标。当用户提到报告相关术语时，
创建独立的报告类型目标。
```

**原因**：
- 中英文混合会造成语言偏见，LLM 可能偏向某种语言模式
- 保持语言一致性有助于 LLM 更好地理解指令
- 每个语言的模板应该完全使用该语言编写

## ✅ 推荐做法

### 1. **使用抽象原则**

描述**为什么**和**如何**，而不是**什么**。

```markdown
✅ Plugin Selection: Choose plugins based on:
   - Data source compatibility (type, geometry, fields)
   - Goal type alignment (visualization → visualization plugins)
   - Parameter availability (required fields exist in metadata)
```

### 2. **使用条件逻辑**

描述决策的条件，而非固定答案。

```markdown
✅ Classification Method Selection:
   - IF user mentions distribution patterns → use quantile
   - IF user mentions uniform intervals → use equal_interval
   - IF user mentions outliers → consider jenks or standard_deviation
   - IF no preference indicated → default to quantile
```

### 3. **使用通用术语**

避免特定领域术语，除非必要。

```markdown
✅ Use: "numeric field", "categorical field", "geometry type"
❌ Avoid: "population column", "name field", "polygon shape"
```

### 4. **强调验证原则**

教导 LLM 如何验证，而非告诉它结果。

```markdown
✅ Field Verification:
   - ALWAYS check data source metadata before referencing fields
   - NEVER assume field existence based on naming conventions
   - IF field not found in metadata, select alternative or report error
```

## 📋 检查清单

在创建或修改提示词模板前，检查：

- [ ] 是否包含具体的输入/输出示例？→ 移除
- [ ] 是否提到特定的字段名称？→ 改为通用描述
- [ ] 是否提到特定的插件 ID？→ 改为选择原则
- [ ] 是否包含硬编码的数值？→ 改为范围或条件
- [ ] 是否使用特定语言的示例？→ 改为抽象原则
- [ ] 是否存在中英文混合？→ 确保单一语言（英文模板用纯英文，中文模板用纯中文）
- [ ] 是否描述了决策过程而非固定答案？→ 确保是
- [ ] 是否强调了验证和错误处理？→ 确保包含

## 🎯 核心原则

### 1. **通用性（Generality）**
提示词应该适用于所有可能的场景，而不只是某些特定情况。

### 2. **抽象性（Abstraction）**
描述模式和原则，而非具体实例。

### 3. **适应性（Adaptability）**
让 LLM 根据具体情况做出判断，而非遵循固定模板。

### 4. **验证性（Verifiability）**
教导 LLM 如何验证自己的决策，而非盲目执行。

## 🔍 审查流程

每次修改提示词后，问自己：

1. **这个提示词是否会让 LLM 偏向某些特定输入？**
   - 如果是 → 移除具体示例

2. **这个提示词是否限制了 LLM 的灵活性？**
   - 如果是 → 改为条件逻辑

3. **这个提示词是否假设了特定的数据结构？**
   - 如果是 → 改为元数据验证

4. **这个提示词是否适用于不同的语言和领域？**
   - 如果不是 → 移除语言/领域特定的内容

## 📝 示例对比

### ❌ 不好的提示词

```markdown
When user asks to "show the map", use the uniform_color_renderer plugin.
For example, if user says "显示陕西省地图", create a visualization goal.
Set color to #409eff by default.
```

**问题**：
- 具体示例："显示陕西省地图"
- 硬编码插件 ID：uniform_color_renderer
- 硬编码颜色值：#409eff
- 特定语言：中文示例

### ✅ 好的提示词

```markdown
When user requests visualization without specifying styling preferences:
1. Select a visualization plugin compatible with the data source geometry type
2. Use default styling parameters unless user specifies otherwise
3. Verify plugin compatibility with data source before selection

Color Selection:
- IF user specifies color → use specified color
- IF user mentions theme (e.g., "red", "blue") → map to appropriate color
- IF no preference → use system default color
```

**优点**：
- 抽象原则，无具体示例
- 条件逻辑，灵活适应
- 通用术语，无硬编码值
- 强调验证步骤

## 🚀 持续改进

定期审查提示词模板：
1. 观察 LLM 的实际输出是否有偏见
2. 收集边界案例，优化原则描述
3. 移除任何新出现的具体示例
4. 增强验证和错误处理的指导

记住：**好的提示词教导 LLM 如何思考，而非告诉它思考什么。**
