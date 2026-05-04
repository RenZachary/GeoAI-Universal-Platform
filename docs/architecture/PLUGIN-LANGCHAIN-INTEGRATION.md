# 插件系统与LangChain集成设计

## 1. 插件作为LangChain Tools

### 1.1 设计理念

GeoAI-UP的插件系统深度集成LangChain框架，所有插件都包装为**LangChain Tools**，实现：

- **动态选择**: LLM根据任务需求自动选择合适的插件
- **Schema验证**: 通过Zod schema确保参数类型安全
- **统一接口**: 所有插件遵循LangChain Tool规范
- **自动文档**: Tool description提供给LLM理解插件功能

### 1.2 Plugin-to-Tool转换架构

```
Plugin Interface          →  LangChain Tool
─────────────────────────────────────────────
Plugin.execute()          →  tool() function
Plugin.metadata.inputs    →  Zod schema
Plugin.description        →  Tool description
Plugin.name               →  Tool name (sanitized)
PluginOutput              →  JSON string response
```

---

## 2. Tool Wrapper实现

### 2.1 核心Wrapper类

```typescript
import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { Plugin, PluginInput, PluginOutput } from '../interfaces/plugin.interface';

class PluginToolWrapper {
  /**
   * 将Plugin包装为LangChain Tool
   */
  static wrapPlugin(plugin: Plugin): DynamicStructuredTool {
    return tool(
      // Tool执行函数
      async (input: Record<string, any>) => {
        try {
          console.log(`Executing plugin: ${plugin.name}`);
          
          // 转换输入为PluginInput格式
          const pluginInput: PluginInput = {
            parameters: input,
            context: {
              timestamp: Date.now(),
              requestId: crypto.randomUUID()
            }
          };
          
          // 执行插件
          const result: PluginOutput = await plugin.execute(pluginInput);
          
          // 返回JSON字符串（LangChain要求）
          return JSON.stringify({
            success: true,
            pluginId: plugin.id,
            resultId: result.data?.id,
            metadata: result.metadata,
            message: result.message || 'Plugin executed successfully'
          });
          
        } catch (error) {
          console.error(`Plugin execution failed: ${plugin.name}`, error);
          
          return JSON.stringify({
            success: false,
            pluginId: plugin.id,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
          });
        }
      },
      {
        // Tool元数据
        name: this.sanitizeName(plugin.name),
        description: this.enrichDescription(plugin),
        schema: this.convertToZodSchema(plugin.metadata.inputs)
      }
    );
  }
  
  /**
   * 清理插件名称以符合Tool命名规范
   * - 只允许小写字母、数字、下划线
   * - 最大长度64字符
   */
  private static sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .substring(0, 64);
  }
  
  /**
   * 丰富Tool描述，添加使用示例
   */
  private static enrichDescription(plugin: Plugin): string {
    const inputDesc = plugin.metadata.inputs
      .map(param => `- ${param.name}: ${param.type}${param.required ? ' (required)' : ' (optional)'}`)
      .join('\n');
    
    return `${plugin.description}\n\nInput Parameters:\n${inputDesc}`;
  }
  
  /**
   * 转换Plugin参数schema为Zod schema
   */
  private static convertToZodSchema(params: PluginParameter[]): z.ZodObject<any> {
    const shape: Record<string, z.ZodType> = {};
    
    for (const param of params) {
      let zodType: z.ZodType;
      
      // 根据参数类型创建对应的Zod类型
      switch (param.type) {
        case 'NativeData':
          zodType = z.string().describe('Reference to NativeData object (ID)');
          break;
        
        case 'number':
          zodType = z.number();
          if (param.defaultValue !== undefined) {
            zodType = zodType.default(param.defaultValue);
          }
          break;
        
        case 'string':
          zodType = z.string();
          if (param.defaultValue !== undefined) {
            zodType = zodType.default(param.defaultValue);
          }
          break;
        
        case 'boolean':
          zodType = z.boolean();
          if (param.defaultValue !== undefined) {
            zodType = zodType.default(param.defaultValue);
          }
          break;
        
        case 'array':
          zodType = z.array(z.any());
          break;
        
        case 'object':
          zodType = z.record(z.any());
          break;
        
        default:
          zodType = z.any();
      }
      
      // 添加验证规则
      if (param.validation) {
        zodType = this.applyValidation(zodType, param.validation);
      }
      
      // 处理可选参数
      if (!param.required) {
        zodType = zodType.optional();
      }
      
      // 添加描述
      if (param.description) {
        zodType = zodType.describe(param.description);
      }
      
      shape[param.name] = zodType;
    }
    
    return z.object(shape);
  }
  
  /**
   * 应用验证规则
   */
  private static applyValidation(
    zodType: z.ZodType, 
    validation: ParameterValidation
  ): z.ZodType {
    let validated = zodType;
    
    if (validation.min !== undefined) {
      validated = (validated as any).min(validation.min);
    }
    
    if (validation.max !== undefined) {
      validated = (validated as any).max(validation.max);
    }
    
    if (validation.pattern) {
      validated = (validated as any).regex(new RegExp(validation.pattern));
    }
    
    if (validation.enum) {
      validated = z.enum(validation.enum as [string, ...string[]]);
    }
    
    return validated;
  }
}
```

---

## 3. Tool Registry管理

### 3.1 注册中心实现

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Plugin } from '../interfaces/plugin.interface';
import { PluginLoader } from './plugin-loader';

class ToolRegistry {
  private tools: Map<string, DynamicStructuredTool> = new Map();
  private pluginLoader: PluginLoader;
  
  constructor(pluginLoader: PluginLoader) {
    this.pluginLoader = pluginLoader;
  }
  
  /**
   * 初始化：加载所有内置插件并注册为Tools
   */
  async initialize(): Promise<void> {
    console.log('Initializing Tool Registry...');
    
    // 加载内置插件
    const builtInPlugins = await this.pluginLoader.loadBuiltInPlugins();
    
    for (const plugin of builtInPlugins) {
      await this.registerPlugin(plugin);
    }
    
    console.log(`Registered ${this.tools.size} built-in tools`);
  }
  
  /**
   * 注册单个插件为Tool
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    try {
      // 初始化插件
      await plugin.initialize();
      
      // 包装为Tool
      const tool = PluginToolWrapper.wrapPlugin(plugin);
      
      // 注册到registry
      this.tools.set(plugin.id, tool);
      
      console.log(`Registered tool: ${tool.name} (${plugin.id})`);
    } catch (error) {
      console.error(`Failed to register plugin ${plugin.id}:`, error);
      throw error;
    }
  }
  
  /**
   * 注册自定义插件
   */
  async registerCustomPlugin(pluginId: string): Promise<void> {
    const plugin = await this.pluginLoader.loadCustomPlugin(pluginId);
    await this.registerPlugin(plugin);
  }
  
  /**
   * 注销插件Tool
   */
  async unregisterPlugin(pluginId: string): Promise<void> {
    const plugin = this.pluginLoader.getPlugin(pluginId);
    
    if (plugin) {
      await plugin.destroy();
      this.tools.delete(pluginId);
      console.log(`Unregistered tool: ${pluginId}`);
    }
  }
  
  /**
   * 获取所有可用Tools
   */
  getAllTools(): DynamicStructuredTool[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * 按类别获取Tools
   */
  getToolsByCategory(category: string): DynamicStructuredTool[] {
    return Array.from(this.tools.values()).filter(tool => {
      // 从plugin id或name推断类别
      return tool.name.includes(category.toLowerCase());
    });
  }
  
  /**
   * 按名称查找Tool
   */
  getToolByName(name: string): DynamicStructuredTool | undefined {
    return Array.from(this.tools.values()).find(
      tool => tool.name === name
    );
  }
  
  /**
   * 获取Tool列表（用于LLM提示）
   */
  getToolDescriptions(): Array<{name: string; description: string}> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description
    }));
  }
  
  /**
   * 重新加载所有Tools（热更新）
   */
  async reloadAll(): Promise<void> {
    console.log('Reloading all tools...');
    
    // 销毁现有plugins
    for (const tool of this.tools.values()) {
      // TODO: Call plugin destroy method
    }
    
    this.tools.clear();
    
    // 重新加载
    await this.initialize();
  }
}
```

---

## 4. 内置插件示例

### 4.1 Buffer Analysis Plugin

```typescript
import { Plugin, PluginInput, PluginOutput } from '../interfaces/plugin.interface';
import { NativeData } from '../../core/types';
import * as turf from '@turf/turf';

class BufferAnalysisPlugin implements Plugin {
  id = 'buffer_analysis';
  name = 'Buffer Analysis';
  version = '1.0.0';
  description = 'Perform buffer analysis on spatial data with specified distance';
  category = 'spatial_analysis';
  
  metadata = {
    inputs: [
      {
        name: 'dataSourceId',
        type: 'NativeData',
        required: true,
        description: 'ID of the NativeData to buffer'
      },
      {
        name: 'distance',
        type: 'number',
        required: true,
        description: 'Buffer distance'
      },
      {
        name: 'unit',
        type: 'string',
        required: true,
        description: 'Distance unit (meters, kilometers, miles, feet)',
        validation: {
          enum: ['meters', 'kilometers', 'miles', 'feet']
        }
      }
    ],
    outputs: [
      {
        name: 'bufferedData',
        type: 'NativeData',
        description: 'Buffered geometry as NativeData'
      }
    ],
    supportedDataTypes: ['geojson', 'shapefile', 'postgis']
  };
  
  async initialize(): Promise<void> {
    console.log('BufferAnalysisPlugin initialized');
  }
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    const { dataSourceId, distance, unit } = input.parameters;
    
    // 获取NativeData
    const nativeData = await dataAccessor.read(dataSourceId);
    
    // 执行缓冲区分析
    let buffered: any;
    
    if (nativeData.type === 'geojson') {
      // 使用Turf.js处理GeoJSON
      const geojson = await fs.readJson(nativeData.reference);
      buffered = turf.buffer(geojson, distance, { units: unit });
    } else if (nativeData.type === 'postgis') {
      // TODO: Use PostGIS ST_Buffer
      throw new Error('PostGIS buffer not yet implemented');
    }
    
    // 保存结果为新NativeData
    const resultId = await dataAccessor.write(buffered, {
      type: 'geojson',
      crs: nativeData.metadata.crs
    });
    
    return {
      success: true,
      data: {
        id: resultId,
        type: 'geojson',
        reference: resultId,
        metadata: { /* ... */ }
      } as NativeData,
      message: `Buffer analysis completed: ${distance} ${unit}`
    };
  }
  
  async destroy(): Promise<void> {
    console.log('BufferAnalysisPlugin destroyed');
  }
  
  getStatus() {
    return 'active';
  }
}
```

### 4.2 MVT Publisher Plugin

```typescript
class MVTPublisherPlugin implements Plugin {
  id = 'mvt_publisher';
  name = 'MVT Publisher';
  version = '1.0.0';
  description = 'Publish vector data as Mapbox Vector Tiles (MVT) service';
  category = 'visualization';
  
  metadata = {
    inputs: [
      {
        name: 'dataSourceId',
        type: 'NativeData',
        required: true,
        description: 'Vector data to publish'
      },
      {
        name: 'layerName',
        type: 'string',
        required: false,
        description: 'Optional layer name'
      }
    ],
    outputs: [
      {
        name: 'serviceUrl',
        type: 'string',
        description: 'MVT service URL'
      }
    ]
  };
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    const { dataSourceId, layerName } = input.parameters;
    
    // 获取NativeData
    const nativeData = await dataAccessor.read(dataSourceId);
    
    // 发布MVT服务
    const service = await mvtServiceRegistry.publishService(
      nativeData,
      {
        layerName: layerName || `layer_${Date.now()}`,
        ttl: 3600000 // 1 hour
      }
    );
    
    return {
      success: true,
      data: {
        serviceId: service.id,
        url: service.url,
        type: 'mvt'
      },
      message: `MVT service published: ${service.url}`
    };
  }
}
```

---

## 5. 在LangGraph中使用Tools

### 5.1 Plugin Executor Node

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';

const pluginExecutor = async (state: GeoAIState) => {
  const results = new Map<string, AnalysisResult>();
  
  // 获取所有可用Tools
  const tools = toolRegistry.getAllTools();
  
  // 创建React Agent（自动选择和执行Tools）
  const agent = createReactAgent({
    llm: llmFactory.createAdapter(currentConfig),
    tools,
    stateModifier: (state) => {
      return `Current task: Execute the following plan\n${JSON.stringify(state.executionPlans)}`;
    }
  });
  
  // 并行执行每个目标的计划
  const executionPromises = Array.from(state.executionPlans!.entries()).map(
    async ([goalId, plan]) => {
      try {
        // Agent自动选择并执行所需的Tools
        const agentResult = await agent.invoke({
          messages: [{
            role: 'user',
            content: `Execute plan for goal ${goalId}: ${JSON.stringify(plan)}`
          }]
        });
        
        // 解析执行结果
        const result: AnalysisResult = {
          id: crypto.randomUUID(),
          goalId,
          status: 'success',
          data: agentResult.messages[agentResult.messages.length - 1].content,
          completedAt: new Date()
        };
        
        results.set(goalId, result);
        
      } catch (error) {
        results.set(goalId, {
          id: crypto.randomUUID(),
          goalId,
          status: 'failed',
          error: error.message,
          completedAt: new Date()
        });
      }
    }
  );
  
  await Promise.all(executionPromises);
  
  return {
    executionResults: results,
    currentStep: 'output'
  };
};
```

---

## 6. 自定义插件开发指南

### 6.1 开发流程

1. **实现Plugin接口**
2. **定义清晰的metadata**（inputs/outputs）
3. **导出为ES Module**
4. **上传到custom目录**
5. **自动注册为LangChain Tool**

### 6.2 示例：自定义统计插件

```typescript
// custom/statistics-plugin/index.ts
import { Plugin, PluginInput, PluginOutput } from '../../interfaces/plugin.interface';

export class CustomStatisticsPlugin implements Plugin {
  id = 'custom_statistics';
  name = 'Custom Statistics';
  version = '1.0.0';
  description = 'Calculate custom statistics on spatial data';
  category = 'spatial_analysis';
  
  metadata = {
    inputs: [
      {
        name: 'dataSourceId',
        type: 'NativeData',
        required: true,
        description: 'Data to analyze'
      },
      {
        name: 'statistics',
        type: 'array',
        required: true,
        description: 'Statistics to calculate (area, perimeter, count)',
        validation: {
          enum: ['area', 'perimeter', 'count', 'bounds']
        }
      }
    ],
    outputs: [
      {
        name: 'statistics',
        type: 'object',
        description: 'Calculated statistics'
      }
    ]
  };
  
  async initialize(): Promise<void> {}
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    // 实现统计逻辑
    const stats = calculateStatistics(input.parameters);
    
    return {
      success: true,
      data: stats,
      message: 'Statistics calculated'
    };
  }
  
  async destroy(): Promise<void> {}
  getStatus() { return 'active'; }
}
```

### 6.3 上传和注册

```typescript
// 前端上传后，后端自动注册
async function handlePluginUpload(file: Express.Multer.File) {
  // 1. 保存到custom目录
  const pluginPath = path.join(workspaceDirs.pluginsCustom, file.originalname);
  await fs.writeFile(pluginPath, file.buffer);
  
  // 2. 动态导入
  const module = await import(pluginPath);
  const PluginClass = module.CustomStatisticsPlugin;
  
  // 3. 实例化
  const plugin = new PluginClass();
  
  // 4. 注册为Tool
  await toolRegistry.registerPlugin(plugin);
  
  return { success: true, pluginId: plugin.id };
}
```

---

## 7. Tool调用监控

### 7.1 Callback Handler

```typescript
class PluginExecutionMonitor extends BaseCallbackHandler {
  name = 'plugin_execution_monitor';
  
  async handleToolStart(tool: any, input: string): Promise<void> {
    console.log(`[TOOL START] ${tool.name}`);
    console.log(`Input: ${input.substring(0, 200)}...`);
    
    // 记录到数据库
    await db.prepare(`
      INSERT INTO plugin_executions (tool_name, input, started_at)
      VALUES (?, ?, datetime('now'))
    `).run(tool.name, input);
  }
  
  async handleToolEnd(output: string): Promise<void> {
    console.log(`[TOOL END] Success`);
    
    // 更新执行记录
    await db.prepare(`
      UPDATE plugin_executions 
      SET output = ?, completed_at = datetime('now'), status = 'success'
      WHERE id = last_insert_rowid()
    `).run(output);
  }
  
  async handleToolError(error: Error): Promise<void> {
    console.error(`[TOOL ERROR] ${error.message}`);
    
    // 记录错误
    await db.prepare(`
      UPDATE plugin_executions 
      SET error = ?, status = 'failed'
      WHERE id = last_insert_rowid()
    `).run(error.message);
  }
}
```

---

## 8. 优势总结

### 8.1 相比传统插件系统的优势

| 特性 | 传统插件系统 | LangChain Tool集成 |
|------|------------|-------------------|
| **选择方式** | 硬编码或配置 | LLM动态选择 |
| **参数验证** | 手动验证 | Zod自动验证 |
| **文档生成** | 手动编写 | 自动生成 |
| **错误处理** | 各自实现 | 统一fallback |
| **流式输出** | 单独实现 | Callback统一 |
| **组合能力** | 有限 | LangGraph编排 |

### 8.2 关键收益

✅ **智能化**: LLM根据上下文自动选择最合适的插件  
✅ **类型安全**: Zod schema确保参数正确性  
✅ **可扩展**: 新增插件自动成为可用Tool  
✅ **可观测**: 统一的监控和日志  
✅ **容错性**: Fallback chains处理失败  

---

## 9. 实施检查清单

- [ ] 实现PluginToolWrapper类
- [ ] 创建ToolRegistry单例
- [ ] 改造所有内置插件实现Plugin接口
- [ ] 集成到LangGraph workflow
- [ ] 添加Plugin Execution Monitor
- [ ] 编写自定义插件开发文档
- [ ] 实现插件热加载机制
- [ ] 添加Tool调用历史记录

---

此设计完全符合需求规格说明书中"充分利用langchain框架，实现LLM与插件联动"的要求。
