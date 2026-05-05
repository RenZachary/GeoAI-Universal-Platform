# 终端节点约束与LLM Prompt设计规范

## 📋 概述

本文档详细说明可视化重构中的**终端节点约束**如何通过LLM Prompt实现，以及相关的错误处理策略。

---

## 🎯 设计决策

### 核心原则

**终端节点约束完全由LLM保证**，不在TaskPlanner中实现复杂的验证逻辑。

**理由：**
1. ✅ LLM已经具备理解约束的能力（通过Prompt教育）
2. ✅ 简化TaskPlanner实现，避免复杂的验证代码
3. ✅ 如果LLM违反约束，在PluginExecutor阶段报错并反馈给用户

---

## 📝 终端节点约束定义

### 什么是终端节点？

终端节点（Terminal Node）是指执行后产生**最终输出**的Plugin，包括：

| Category | Plugin类型 | 输出 | 是否终端节点 |
|----------|-----------|------|------------|
| **Visualization** | uniform_color_renderer, categorical_renderer, choropleth_renderer | MVT/WMS/GeoJSON | ✅ Yes |
| **Textual** | report_generator | HTML/PDF | ✅ Yes |
| **Statistical** | statistics_calculator, aggregation | JSON | ❌ No |
| **Computational** | buffer_analysis, overlay_analysis, filter | NativeData | ❌ No |

### 约束规则

**Rule 1: 终端节点必须是最后一步**
```
✅ 正确：
Step 1: Filter (computational)
Step 2: Statistics (statistical)
Step 3: Choropleth Renderer (visualization) ← 终端节点在最后

❌ 错误：
Step 1: Choropleth Renderer (visualization) ← 终端节点不能在中间
Step 2: Report Generator (textual)
```

**Rule 2: 一个Goal最多只能有一个终端节点**
```
✅ 正确：
Goal 1: [Filter → Choropleth Renderer]
Goal 2: [Statistics → Report Generator]

❌ 错误：
Goal 1: [Choropleth Renderer → Report Generator] ← 两个终端节点
```

**Rule 3: Textual类Plugin必须有前序步骤**
```
✅ 正确：
Step 1: Statistics Calculator
Step 2: Report Generator ← 依赖Step 1的结果

❌ 错误：
Step 1: Report Generator ← 没有前序步骤提供数据
```

---

## 💬 LLM Prompt设计

### Task Planning Prompt中的约束说明

在`task-planning.md` Prompt模板中添加明确的约束说明：

```markdown
## Important Constraints

### 1. Terminal Node Rules

**Definition:** Terminal nodes are plugins that produce final outputs (visualizations or reports).

**Visualization Plugins (Terminal):**
- uniform_color_renderer: Display data with single color
- categorical_renderer: Color by category field
- choropleth_renderer: Color by numeric value ranges

**Textual Plugins (Terminal):**
- report_generator: Generate HTML/PDF reports

**Rules:**
1. Terminal plugins MUST be the LAST step in a goal's execution plan
2. A goal can have AT MOST ONE terminal node
3. If you need both visualization and report, create TWO separate goals

**Examples:**

✅ CORRECT - Visualization as last step:
```json
{
  "steps": [
    {
      "stepId": "step_1",
      "pluginId": "filter",
      "parameters": { "dataSourceId": "data_1", "conditions": [...] }
    },
    {
      "stepId": "step_2",
      "pluginId": "choropleth_renderer",
      "parameters": { 
        "dataSourceId": "{{step_1.result}}",
        "valueField": "population"
      }
    }
  ]
}
```

❌ WRONG - Terminal node in middle:
```json
{
  "steps": [
    {
      "stepId": "step_1",
      "pluginId": "choropleth_renderer",  // ← Terminal node cannot be first
      "parameters": { ... }
    },
    {
      "stepId": "step_2",
      "pluginId": "report_generator",  // ← Another terminal node
      "parameters": { ... }
    }
  ]
}
```

### 2. Dependency Rules

**Rules:**
1. Each step can only depend on PREVIOUS steps (no forward references)
2. No circular dependencies allowed
3. If step B depends on step A, step A must appear BEFORE step B

**Placeholder Syntax:**
- Use `{{step_id.result}}` to reference previous step's output
- Example: `"dataSourceId": "{{step_1.result}}"`

### 3. Single Output Rule

**Rule:** Each plugin execution produces exactly ONE output.

**Implications:**
- If you need multiple results (e.g., intersection AND union), you have two options:
  1. Create separate goals for each result
  2. Repeat the plugin with different parameters in the same goal

**Example - Separate Goals:**
```
Goal 1: Show intersection of layer A and B
  Step 1: overlay_analysis (operation: intersect)
  Step 2: uniform_color_renderer

Goal 2: Show union of layer A and B
  Step 1: overlay_analysis (operation: union)
  Step 2: uniform_color_renderer
```

### 4. Data Source Compatibility

**Rule:** Ensure plugin supports the data source type.

**Check:**
- Vector plugins support: geojson, shapefile, postgis
- Raster plugins support: geotiff
- If unsure, choose vector plugins for vector data sources

**Error Example:**
```
❌ Using heatmap (requires points) with polygon data
✅ Using choropleth renderer with polygon data
```

---

## Decision Process

When creating an execution plan, follow these steps:

1. **Analyze user intent** → Determine goal type (visualization/analysis/report)
2. **Check data source** → Verify geometry type and available fields
3. **Select compatible plugins** → Filter by capability
4. **Order steps correctly** → Terminal node MUST be last
5. **Set up dependencies** → Use placeholders to link steps
6. **Validate constraints** → Double-check terminal node rules

---

## Common Mistakes to Avoid

❌ **Mistake 1:** Putting visualization before analysis
```json
// WRONG
{
  "steps": [
    { "pluginId": "choropleth_renderer" },  // Visualization first
    { "pluginId": "statistics_calculator" }  // Analysis after
  ]
}

// CORRECT
{
  "steps": [
    { "pluginId": "statistics_calculator" },  // Analysis first
    { "pluginId": "choropleth_renderer" }     // Visualization last
  ]
}
```

❌ **Mistake 2:** Multiple terminal nodes in one goal
```json
// WRONG
{
  "steps": [
    { "pluginId": "choropleth_renderer" },  // Terminal 1
    { "pluginId": "report_generator" }       // Terminal 2
  ]
}

// CORRECT - Split into two goals
Goal 1: [choropleth_renderer]
Goal 2: [report_generator]
```

❌ **Mistake 3:** Report without data
```json
// WRONG
{
  "steps": [
    { "pluginId": "report_generator" }  // No predecessor
  ]
}

// CORRECT
{
  "steps": [
    { "pluginId": "statistics_calculator" },
    { "pluginId": "report_generator" }  // Has predecessor
  ]
}
```
```

---

## ⚠️ 错误处理策略

### 场景1: LLM生成违反约束的计划

**检测时机：** PluginExecutor执行步骤时

**检测逻辑：**
```typescript
async function executeStep(
  step: ExecutionStep,
  context: ExecutionContext
): Promise<AnalysisResult> {
  const capability = getPluginCapability(step.pluginId);
  
  // 检查终端节点是否在最后
  if (capability.isTerminalNode) {
    const isLastStep = context.plan.steps.indexOf(step) === context.plan.steps.length - 1;
    
    if (!isLastStep) {
      throw new ValidationError({
        code: 'TERMINAL_NODE_NOT_LAST',
        message: `Plugin '${step.pluginId}' is a terminal node and must be the last step.`,
        details: `This is likely an LLM planning error. The generated plan has ${context.plan.steps.length} steps, but terminal node is at position ${context.plan.steps.indexOf(step) + 1}.`,
        suggestion: 'Please retry with a clearer request, or manually specify the desired workflow.',
        retryable: true
      });
    }
  }
  
  // 继续执行...
}
```

**错误响应：**
```json
{
  "success": false,
  "error": {
    "code": "TERMINAL_NODE_NOT_LAST",
    "message": "Plugin 'choropleth_renderer' is a terminal node and must be the last step.",
    "details": "This is likely an LLM planning error. The generated plan has 3 steps, but terminal node is at position 1.",
    "suggestion": "Please retry with a clearer request, or manually specify the desired workflow.",
    "retryable": true
  }
}
```

### 场景2: Textual Plugin没有前序步骤

**检测逻辑：**
```typescript
if (capability.executionCategory === 'textual') {
  const stepIndex = context.plan.steps.indexOf(step);
  
  if (stepIndex === 0) {
    throw new ValidationError({
      code: 'TEXTUAL_PLUGIN_NO_PREDECESSOR',
      message: `Plugin '${step.pluginId}' requires at least one predecessor step.`,
      details: 'Textual plugins (like report_generator) need data from previous steps.',
      suggestion: 'Add a statistical or computational step before the report generator.'
    });
  }
}
```

### 场景3: 多个终端节点

**检测逻辑：**
```typescript
function validatePlan(plan: ExecutionPlan): ValidationResult {
  const terminalSteps = plan.steps.filter(step => {
    const capability = getPluginCapability(step.pluginId);
    return capability.isTerminalNode;
  });
  
  if (terminalSteps.length > 1) {
    return {
      valid: false,
      error: {
        code: 'MULTIPLE_TERMINAL_NODES',
        message: `Plan has ${terminalSteps.length} terminal nodes, but maximum is 1.`,
        details: `Terminal nodes: ${terminalSteps.map(s => s.pluginId).join(', ')}`,
        suggestion: 'Split into multiple goals, each with one terminal node.'
      }
    };
  }
  
  return { valid: true };
}
```

---

## 🔄 重试机制（未来扩展）

当前设计**不实现自动重试**，错误直接返回给用户。

未来可以考虑的重试策略：

```typescript
async function executeWithRetry(
  plan: ExecutionPlan,
  maxRetries: number = 2
): Promise<ExecutionResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await executePlan(plan);
    } catch (error) {
      if (error instanceof ValidationError && error.retryable) {
        console.warn(`[Executor] Attempt ${attempt} failed, retrying...`);
        
        // Option 1: Ask LLM to regenerate plan
        if (attempt < maxRetries) {
          plan = await taskPlanner.regeneratePlan(error);
        }
      } else {
        throw error;  // Non-retryable error
      }
    }
  }
  
  throw new Error(`Failed after ${maxRetries} attempts`);
}
```

---

## 📊 监控与调试

### 日志记录

```typescript
console.log('[TaskPlanner] Generated execution plan:', {
  goalId: plan.goalId,
  steps: plan.steps.map(s => ({
    stepId: s.stepId,
    pluginId: s.pluginId,
    isTerminal: getPluginCapability(s.pluginId).isTerminalNode
  })),
  terminalNodeCount: plan.steps.filter(s => 
    getPluginCapability(s.pluginId).isTerminalNode
  ).length
});
```

### 前端提示

当检测到约束违反时，前端可以显示友好的提示：

```
⚠️ 执行计划存在问题

系统检测到执行计划违反了终端节点约束：
- 可视化插件必须是最后一步
- 当前计划中，可视化插件在第1步（共3步）

建议：
1. 重新描述您的需求，更明确地说明期望的工作流程
2. 或者，将任务拆分为多个独立的目标

技术细节：TERMINAL_NODE_NOT_LAST
```

---

## ✅ 验收标准

重构完成后，以下场景应该正确处理：

| 场景 | 期望行为 | 验收标准 |
|------|---------|---------|
| LLM生成正确的计划 | 正常执行 | ✅ 无错误 |
| LLM将终端节点放在中间 | 报错并提示 | ✅ ValidationError with helpful message |
| LLM生成多个终端节点 | 报错并提示 | ✅ ValidationError suggesting split goals |
| Textual Plugin没有前序 | 报错并提示 | ✅ ValidationError suggesting add predecessor |
| 用户重复请求 | 每次都能正确处理 | ✅ Consistent behavior |

---

## 📝 总结

**关键要点：**

1. ✅ **约束由LLM保证**：通过详细的Prompt教育LLM遵守规则
2. ✅ **运行时检测**：PluginExecutor阶段验证约束，捕获LLM错误
3. ✅ **清晰的错误提示**：帮助用户理解问题并重试
4. ✅ **简化实现**：不需要复杂的验证逻辑，降低维护成本
5. ❌ **不自动重试**：当前版本直接报错，未来可扩展

**下一步：**
- 更新`task-planning.md` Prompt模板
- 在PluginExecutor中添加约束检测代码
- 编写测试用例验证错误处理
