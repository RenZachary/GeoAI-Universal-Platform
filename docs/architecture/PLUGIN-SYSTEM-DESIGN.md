# GeoAI-UP 插件系统架构设计文档

## 1. 插件系统概述

### 1.1 设计理念

GeoAI-UP采用插件化架构，核心功能通过插件实现，支持：
- **内置插件**: 系统预装的核心功能插件
- **自定义插件**: 用户开发的扩展插件
- **热插拔**: 运行时加载、启动、停用插件
- **标准化接口**: 统一的插件接口规范

### 1.2 插件分类

```typescript
enum PluginCategory {
  SPATIAL_ANALYSIS = 'spatial_analysis',      // 空间分析
  DATA_TRANSFORM = 'data_transform',          // 数据转换
  VISUALIZATION = 'visualization',            // 可视化
  REPORT_GENERATION = 'report_generation',    // 报告生成
  UTILITY = 'utility',                        // 工具类
}
```

### 1.3 插件目录结构

```
server/src/plugins/
├── builtin/                    # 内置插件
│   ├── spatial-analysis/
│   │   ├── buffer-plugin/
│   │   ├── overlay-plugin/
│   │   ├── statistics-plugin/
│   │   └── heatmap-plugin/
│   ├── report-generation/
│   │   └── report-generator/
│   └── visualization/
│       ├── mvt-publisher/
│       ├── wms-publisher/
│       └── heatmap-renderer/
├── custom/                     # 自定义插件目录
│   └── (用户上传的插件)
└── interfaces/                 # 插件接口定义
    └── plugin.interface.ts
```

---

## 2. 插件接口定义

### 2.1 核心Plugin接口

```typescript
interface Plugin {
  // 基本信息
  id: string;
  name: string;
  version: string;
  description: string;
  category: PluginCategory;
  author?: string;
  
  // 元数据
  metadata: PluginMetadata;
  
  // 生命周期方法
  initialize(config?: PluginConfig): Promise<void>;
  execute(input: PluginInput): Promise<PluginOutput>;
  destroy(): Promise<void>;
  
  // 状态管理
  getStatus(): PluginStatus;
  setStatus(status: PluginStatus): void;
}

interface PluginMetadata {
  inputs: PluginParameter[];
  outputs: PluginParameter[];
  supportedDataTypes: DataType[];
  requiredPermissions: Permission[];
  dependencies?: string[];  // 依赖的其他插件
}

interface PluginParameter {
  name: string;
  type: ParameterType;
  required: boolean;
  description?: string;
  defaultValue?: any;
}

type ParameterType = 
  | 'NativeData' 
  | 'number' 
  | 'string' 
  | 'boolean' 
  | 'array' 
  | 'object';

interface PluginConfig {
  [key: string]: any;
}

interface PluginInput {
  data: NativeData[];
  parameters: Record<string, any>;
  context: ExecutionContext;
}

interface PluginOutput {
  data: NativeData | ServiceMetadata;
  metadata: Record<string, any>;
}

type PluginStatus = 'initialized' | 'active' | 'inactive' | 'error';

interface ExecutionContext {
  conversationId: string;
  dataSources: NativeData[];
  previousResults: Map<string, ExecutionResult>;
  tempDir: string;
  language: string;
}
```

### 2.2 权限定义

```typescript
enum Permission {
  READ_FILE = 'read_file',              // 读取文件
  WRITE_FILE = 'write_file',            // 写入文件
  ACCESS_DATABASE = 'access_database',  // 访问数据库
  CREATE_TEMP = 'create_temp',          // 创建临时文件
  PUBLISH_SERVICE = 'publish_service',  // 发布服务
  NETWORK_ACCESS = 'network_access',    // 网络访问
}
```

---

## 3. 内置插件设计

### 3.1 空间分析插件

#### 3.1.1 BufferPlugin（缓冲区分析插件）

```typescript
class BufferPlugin implements Plugin {
  id = 'buffer-analyzer';
  name = 'Buffer Analyzer';
  version = '1.0.0';
  description = 'Create buffer zones around features';
  category = PluginCategory.SPATIAL_ANALYSIS;
  
  metadata = {
    inputs: [
      {
        name: 'data',
        type: 'NativeData',
        required: true,
        description: 'Input vector data',
      },
      {
        name: 'distance',
        type: 'number',
        required: true,
        description: 'Buffer distance',
      },
      {
        name: 'unit',
        type: 'string',
        required: false,
        defaultValue: 'meters',
        description: 'Distance unit (meters, kilometers, miles)',
      },
    ],
    outputs: [
      {
        name: 'bufferedData',
        type: 'NativeData',
        description: 'Buffered vector data',
      },
    ],
    supportedDataTypes: ['geojson', 'shapefile', 'postgis'],
    requiredPermissions: [Permission.READ_FILE, Permission.WRITE_FILE],
  };
  
  private status: PluginStatus = 'initialized';
  
  async initialize(config?: PluginConfig): Promise<void> {
    this.status = 'active';
  }
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    const { data, parameters } = input;
    
    if (data.length === 0) {
      throw new Error('No input data provided');
    }
    
    const distance = parameters.distance;
    const unit = parameters.unit || 'meters';
    const inputData = data[0];
    
    // 调用BufferAnalyzer执行缓冲区分析
    // Analyzer通过DBAccessorFactory获取对应的Accessor
    // Accessor内部决定如何实现（Turf.js或SQL）
    const analyzer = AnalyzerFactory.create('buffer');
    const result = await analyzer.createBuffer(inputData, distance, unit);
    
    return {
      data: result,
      metadata: {
        operation: 'buffer',
        distance: distance,
        unit: unit,
        featureCount: this.getFeatureCount(result),
      },
    };
  }
  
  async destroy(): Promise<void> {
    this.status = 'inactive';
  }
  
  getStatus(): PluginStatus {
    return this.status;
  }
  
  setStatus(status: PluginStatus): void {
    this.status = status;
  }
}
```

#### 3.1.2 OverlayPlugin（叠加分析插件）

```typescript
class OverlayPlugin implements Plugin {
  id = 'overlay-analyzer';
  name = 'Overlay Analyzer';
  version = '1.0.0';
  description = 'Perform overlay operations (intersect, union, difference)';
  category = PluginCategory.SPATIAL_ANALYSIS;
  
  metadata = {
    inputs: [
      {
        name: 'data1',
        type: 'NativeData',
        required: true,
        description: 'First input dataset',
      },
      {
        name: 'data2',
        type: 'NativeData',
        required: true,
        description: 'Second input dataset',
      },
      {
        name: 'operation',
        type: 'string',
        required: true,
        description: 'Overlay operation: intersect, union, difference',
      },
    ],
    outputs: [
      {
        name: 'result',
        type: 'NativeData',
        description: 'Overlay result',
      },
    ],
    supportedDataTypes: ['geojson', 'shapefile', 'postgis'],
    requiredPermissions: [Permission.READ_FILE, Permission.WRITE_FILE],
  };
  
  private status: PluginStatus = 'initialized';
  
  async initialize(config?: PluginConfig): Promise<void> {
    this.status = 'active';
  }
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    const { data, parameters } = input;
    
    if (data.length < 2) {
      throw new Error('Two datasets are required for overlay analysis');
    }
    
    const operation = parameters.operation;
    const data1 = data[0];
    const data2 = data[1];
    
    let result: NativeData;
    
    if (data1.type === 'postgis' && data2.type === 'postgis') {
      // PostGIS叠加分析
      result = await this.executePostGISOverlay(data1, data2, operation);
    } else {
      // 转换为GeoJSON使用Turf.js
      const geojson1 = await this.loadAsGeoJSON(data1);
      const geojson2 = await this.loadAsGeoJSON(data2);
      
      let overlayResult;
      switch (operation) {
        case 'intersect':
          overlayResult = turf.intersect(geojson1, geojson2);
          break;
        case 'union':
          overlayResult = turf.union(geojson1, geojson2);
          break;
        case 'difference':
          overlayResult = turf.difference(geojson1, geojson2);
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
      
      result = await this.saveResult(overlayResult, `overlay_${Date.now()}`);
    }
    
    return {
      data: result,
      metadata: {
        operation: operation,
        inputFeatures1: this.getFeatureCount(data1),
        inputFeatures2: this.getFeatureCount(data2),
        outputFeatures: this.getFeatureCount(result),
      },
    };
  }
  
  async destroy(): Promise<void> {
    this.status = 'inactive';
  }
  
  getStatus(): PluginStatus {
    return this.status;
  }
  
  setStatus(status: PluginStatus): void {
    this.status = status;
  }
}
```

#### 3.1.3 StatisticsPlugin（统计分析插件）

```typescript
class StatisticsPlugin implements Plugin {
  id = 'statistics-analyzer';
  name = 'Statistics Analyzer';
  version = '1.0.0';
  description = 'Calculate statistical metrics for spatial data';
  category = PluginCategory.SPATIAL_ANALYSIS;
  
  metadata = {
    inputs: [
      {
        name: 'data',
        type: 'NativeData',
        required: true,
        description: 'Input vector data',
      },
      {
        name: 'field',
        type: 'string',
        required: false,
        description: 'Attribute field to analyze',
      },
    ],
    outputs: [
      {
        name: 'statistics',
        type: 'NativeData',
        description: 'Statistical results',
      },
    ],
    supportedDataTypes: ['geojson', 'shapefile', 'postgis'],
    requiredPermissions: [Permission.READ_FILE],
  };
  
  private status: PluginStatus = 'initialized';
  
  async initialize(config?: PluginConfig): Promise<void> {
    this.status = 'active';
  }
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    const { data, parameters } = input;
    const inputData = data[0];
    const field = parameters.field;
    
    const geojson = await this.loadAsGeoJSON(inputData);
    
    // 计算面积统计
    const areas = geojson.features.map(f => turf.area(f));
    const areaStats = this.calculateStats(areas);
    
    // 如果指定了字段，计算字段统计
    let fieldStats = null;
    if (field) {
      const values = geojson.features
        .map(f => f.properties?.[field])
        .filter(v => v !== undefined && v !== null);
      fieldStats = this.calculateStats(values);
    }
    
    // 构建结果
    const resultGeoJSON = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: null,
        properties: {
          areaStatistics: areaStats,
          fieldStatistics: fieldStats,
          totalFeatures: geojson.features.length,
        },
      }],
    };
    
    const result = await this.saveResult(resultGeoJSON, `stats_${Date.now()}`);
    
    return {
      data: result,
      metadata: {
        statistics: {
          area: areaStats,
          field: fieldStats,
        },
      },
    };
  }
  
  private calculateStats(values: number[]): StatisticalSummary {
    if (values.length === 0) {
      return { count: 0, min: 0, max: 0, mean: 0, sum: 0 };
    }
    
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    return {
      count: values.length,
      min,
      max,
      mean,
      sum,
    };
  }
  
  async destroy(): Promise<void> {
    this.status = 'inactive';
  }
  
  getStatus(): PluginStatus {
    return this.status;
  }
  
  setStatus(status: PluginStatus): void {
    this.status = status;
  }
}

interface StatisticalSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  sum: number;
}
```

#### 3.1.4 HeatmapPlugin（热力图插件）

```typescript
class HeatmapPlugin implements Plugin {
  id = 'heatmap-analyzer';
  name = 'Heatmap Analyzer';
  version = '1.0.0';
  description = 'Generate heatmap from point data';
  category = PluginCategory.SPATIAL_ANALYSIS;
  
  metadata = {
    inputs: [
      {
        name: 'data',
        type: 'NativeData',
        required: true,
        description: 'Input point data',
      },
      {
        name: 'radius',
        type: 'number',
        required: false,
        defaultValue: 500,
        description: 'Heatmap radius in meters',
      },
      {
        name: 'intensityField',
        type: 'string',
        required: false,
        description: 'Field to use for intensity weighting',
      },
    ],
    outputs: [
      {
        name: 'heatmap',
        type: 'NativeData',
        description: 'Heatmap GeoJSON',
      },
    ],
    supportedDataTypes: ['geojson', 'shapefile', 'postgis'],
    requiredPermissions: [Permission.READ_FILE, Permission.WRITE_FILE],
  };
  
  private status: PluginStatus = 'initialized';
  
  async initialize(config?: PluginConfig): Promise<void> {
    this.status = 'active';
  }
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    const { data, parameters } = input;
    const inputData = data[0];
    
    const radius = parameters.radius || 500;
    const intensityField = parameters.intensityField;
    
    const geojson = await this.loadAsGeoJSON(inputData);
    
    // 提取点坐标和强度
    const points = geojson.features
      .filter(f => f.geometry.type === 'Point')
      .map(f => ({
        coordinates: f.geometry.coordinates,
        intensity: intensityField ? f.properties?.[intensityField] || 1 : 1,
      }));
    
    // 生成网格密度
    const gridData = this.calculateDensity(points, radius);
    
    // 转换为GeoJSON
    const heatmapGeoJSON = this.gridToGeoJSON(gridData);
    
    const result = await this.saveResult(heatmapGeoJSON, `heatmap_${Date.now()}`);
    
    return {
      data: result,
      metadata: {
        pointCount: points.length,
        radius: radius,
        gridSize: gridData.width + 'x' + gridData.height,
      },
    };
  }
  
  private calculateDensity(points: Point[], radius: number): GridData {
    // 简化的密度计算算法
    // 实际实现可使用更复杂的核密度估计
    const bbox = this.calculateBBox(points);
    const cellSize = radius / 2;
    const width = Math.ceil((bbox.maxX - bbox.minX) / cellSize);
    const height = Math.ceil((bbox.maxY - bbox.minY) / cellSize);
    
    const grid = Array(height).fill(null).map(() => Array(width).fill(0));
    
    points.forEach(point => {
      const col = Math.floor((point.coordinates[0] - bbox.minX) / cellSize);
      const row = Math.floor((point.coordinates[1] - bbox.minY) / cellSize);
      
      // 在半径范围内增加密度值
      const radiusInCells = Math.ceil(radius / cellSize);
      for (let dy = -radiusInCells; dy <= radiusInCells; dy++) {
        for (let dx = -radiusInCells; dx <= radiusInCells; dx++) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance <= radiusInCells) {
            const newRow = row + dy;
            const newCol = col + dx;
            if (newRow >= 0 && newRow < height && newCol >= 0 && newCol < width) {
              grid[newRow][newCol] += point.intensity * (1 - distance / radiusInCells);
            }
          }
        }
      }
    });
    
    return { grid, width, height, bbox, cellSize };
  }
  
  async destroy(): Promise<void> {
    this.status = 'inactive';
  }
  
  getStatus(): PluginStatus {
    return this.status;
  }
  
  setStatus(status: PluginStatus): void {
    this.status = status;
  }
}
```

---

### 3.2 可视化插件

#### 3.2.1 MVTPublisherPlugin（MVT发布插件）

```typescript
class MVTPublisherPlugin implements Plugin {
  id = 'mvt-publisher';
  name = 'MVT Publisher';
  version = '1.0.0';
  description = 'Publish vector data as MVT service';
  category = PluginCategory.VISUALIZATION;
  
  metadata = {
    inputs: [
      {
        name: 'data',
        type: 'NativeData',
        required: true,
        description: 'Vector data to publish',
      },
    ],
    outputs: [
      {
        name: 'service',
        type: 'ServiceMetadata',
        description: 'MVT service metadata',
      },
    ],
    supportedDataTypes: ['geojson', 'shapefile', 'postgis'],
    requiredPermissions: [Permission.READ_FILE, Permission.PUBLISH_SERVICE],
  };
  
  private status: PluginStatus = 'initialized';
  private mvtService: MVTService;
  
  async initialize(config?: PluginConfig): Promise<void> {
    this.mvtService = new MVTService();
    this.status = 'active';
  }
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    const { data } = input;
    const inputData = data[0];
    
    // 发布MVT服务
    const serviceMetadata = await this.mvtService.publish(inputData);
    
    return {
      data: serviceMetadata,
      metadata: {
        serviceId: serviceMetadata.serviceId,
        tileUrlTemplate: serviceMetadata.tileUrlTemplate,
      },
    };
  }
  
  async destroy(): Promise<void> {
    this.status = 'inactive';
  }
  
  getStatus(): PluginStatus {
    return this.status;
  }
  
  setStatus(status: PluginStatus): void {
    this.status = status;
  }
}
```

#### 3.2.2 WMSPublisherPlugin（WMS发布插件）

```typescript
class WMSPublisherPlugin implements Plugin {
  id = 'wms-publisher';
  name = 'WMS Publisher';
  version = '1.0.0';
  description = 'Publish raster data as WMS service';
  category = PluginCategory.VISUALIZATION;
  
  metadata = {
    inputs: [
      {
        name: 'data',
        type: 'NativeData',
        required: true,
        description: 'Raster data to publish',
      },
    ],
    outputs: [
      {
        name: 'service',
        type: 'ServiceMetadata',
        description: 'WMS service metadata',
      },
    ],
    supportedDataTypes: ['tif'],
    requiredPermissions: [Permission.READ_FILE, Permission.PUBLISH_SERVICE],
  };
  
  private status: PluginStatus = 'initialized';
  private wmsService: WMSService;
  
  async initialize(config?: PluginConfig): Promise<void> {
    this.wmsService = new WMSService();
    this.status = 'active';
  }
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    const { data } = input;
    const inputData = data[0];
    
    // 发布WMS服务
    const serviceMetadata = await this.wmsService.publish(inputData);
    
    return {
      data: serviceMetadata,
      metadata: {
        serviceId: serviceMetadata.serviceId,
        imageUrlTemplate: serviceMetadata.imageUrlTemplate,
      },
    };
  }
  
  async destroy(): Promise<void> {
    this.status = 'inactive';
  }
  
  getStatus(): PluginStatus {
    return this.status;
  }
  
  setStatus(status: PluginStatus): void {
    this.status = status;
  }
}
```

---

### 3.3 报告生成插件

#### 3.3.1 ReportGeneratorPlugin（报告生成插件）

```typescript
class ReportGeneratorPlugin implements Plugin {
  id = 'report-generator';
  name = 'Report Generator';
  version = '1.0.0';
  description = 'Generate analysis report from results';
  category = PluginCategory.REPORT_GENERATION;
  
  metadata = {
    inputs: [
      {
        name: 'results',
        type: 'NativeData',
        required: true,
        description: 'Analysis results to include in report',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        defaultValue: 'Analysis Report',
        description: 'Report title',
      },
      {
        name: 'format',
        type: 'string',
        required: false,
        defaultValue: 'html',
        description: 'Report format: html or pdf',
      },
    ],
    outputs: [
      {
        name: 'report',
        type: 'NativeData',
        description: 'Generated report file',
      },
    ],
    supportedDataTypes: ['geojson', 'shapefile'],
    requiredPermissions: [Permission.READ_FILE, Permission.WRITE_FILE],
  };
  
  private status: PluginStatus = 'initialized';
  
  async initialize(config?: PluginConfig): Promise<void> {
    this.status = 'active';
  }
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    const { data, parameters } = input;
    
    const title = parameters.title || 'Analysis Report';
    const format = parameters.format || 'html';
    
    // 收集分析结果
    const results = await this.collectResults(data);
    
    // 生成报告内容
    const reportContent = await this.generateReportContent(title, results);
    
    // 保存报告文件
    const reportPath = await this.saveReport(reportContent, title, format);
    
    const result: NativeData = {
      id: `report_${Date.now()}`,
      type: 'geojson', // 报告作为特殊类型的文件
      metadata: {
        name: title,
        format: format,
        path: reportPath,
      },
      reference: {
        type: 'file',
        path: reportPath,
      },
      createdAt: new Date(),
    };
    
    return {
      data: result,
      metadata: {
        title: title,
        format: format,
        path: reportPath,
        fileSize: await this.getFileSize(reportPath),
      },
    };
  }
  
  private async generateReportContent(title: string, results: any[]): Promise<string> {
    // 生成HTML报告
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          h1 { color: #333; }
          .section { margin: 20px 0; }
          .stat { background: #f5f5f5; padding: 10px; margin: 5px 0; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="section">
          <h2>Generated at</h2>
          <p>${new Date().toLocaleString()}</p>
        </div>
        <div class="section">
          <h2>Analysis Results</h2>
          ${results.map(r => this.renderResult(r)).join('')}
        </div>
      </body>
      </html>
    `;
  }
  
  async destroy(): Promise<void> {
    this.status = 'inactive';
  }
  
  getStatus(): PluginStatus {
    return this.status;
  }
  
  setStatus(status: PluginStatus): void {
    this.status = status;
  }
}
```

---

## 4. 自定义插件开发指南

### 4.0 依赖管理

**重要：自定义插件使用服务器共享依赖（严格模式）**

- ✅ 插件代码只能 `import` 服务器 `package.json` 中已声明的库
- ❌ 插件不能自带依赖，也不能请求安装新依赖
- ⚠️ **如果插件使用了未安装的库，执行时将报错，平台不予处理**
- 📦 插件上传时只需包含 `.js` 文件或编译后的代码

**责任划分**：
- **平台方**：提供基础依赖列表（见下方）
- **插件开发者**：确保只使用已提供的依赖，自行测试兼容性
- **平台不负责**：为个别插件安装额外依赖

**可用依赖列表**（服务器 `package.json` 中声明）：
```typescript
// ========== GIS 处理 ==========
import * as turf from '@turf/turf';           // 空间分析
import gdal from 'gdal-async';                 // 栅格数据处理
import * as proj4 from 'proj4';                // 坐标转换
import * as shapefile from 'shapefile';        // Shapefile读写
import * as geotiff from 'geotiff';            // GeoTIFF读取
import geojsonVt from 'geojson-vt';            // GeoJSON转矢量瓦片
import vtPbf from 'vt-pbf';                    // 矢量瓦片编码

// ========== 数据库 ==========
import Database from 'better-sqlite3';         // SQLite
import pg from 'pg';                           // PostgreSQL/PostGIS

// ========== Web框架 ==========
import express from 'express';                 // HTTP服务器
import multer from 'multer';                   // 文件上传
import cors from 'cors';                       // CORS支持

// ========== 工具库 ==========
import axios from 'axios';                     // HTTP客户端
import { v4 as uuidv4 } from 'uuid';           // UUID生成
import fs from 'fs';                     // 文件系统操作
import path from 'path';                       // 路径处理
import dotenv from 'dotenv';                   // 环境变量

// ========== LLM ==========
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

// ... 其他在 server/package.json dependencies 中声明的库
```

**插件开发最佳实践**：
1. **开发前检查**：查看服务器 `package.json` 确认可用依赖
2. **最小化依赖**：优先使用原生Node.js API和已提供的GIS库
3. **充分测试**：在本地模拟服务器环境测试插件
4. **错误处理**：捕获可能的 `MODULE_NOT_FOUND` 错误并给出友好提示

**示例：安全的插件代码**
```typescript
import { Plugin, PluginInput, PluginOutput } from '../interfaces/plugin.interface';
import * as turf from '@turf/turf';  // ✅ 安全：@turf/turf 已安装

export class MyPlugin implements Plugin {
  async execute(input: PluginInput): Promise<PluginOutput> {
    try {
      // 使用已安装的库
      const result = turf.buffer(input.data, 500, { units: 'meters' });
      return { success: true, data: result };
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error('Required library not available on server');
      }
      throw error;
    }
  }
}
```

**示例：不安全的插件代码**
```typescript
import someObscureLib from 'some-obscure-lib';  // ❌ 危险：未安装
// 如果服务器没有这个库，插件加载时会崩溃
```

**平台不提供**：
- ❌ 动态安装依赖功能
- ❌ 插件级别的 package.json 解析
- ❌ 依赖冲突解决
- ❌ 沙箱隔离不同插件的依赖版本

### 4.1 插件项目结构

```
my-custom-plugin/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # 插件入口
│   ├── main.plugin.ts    # 主插件类
│   └── utils.ts          # 工具函数
└── README.md
```

### 4.2 插件示例：自定义空间分析插件

```typescript
// src/main.plugin.ts
import { Plugin, PluginInput, PluginOutput, PluginMetadata, PluginCategory } from '../interfaces/plugin.interface';

export class CustomAnalysisPlugin implements Plugin {
  id = 'custom-analysis';
  name = 'Custom Spatial Analysis';
  version = '1.0.0';
  description = 'A custom spatial analysis plugin';
  category = PluginCategory.SPATIAL_ANALYSIS;
  author = 'Your Name';
  
  metadata: PluginMetadata = {
    inputs: [
      {
        name: 'data',
        type: 'NativeData',
        required: true,
        description: 'Input spatial data',
      },
      {
        name: 'threshold',
        type: 'number',
        required: false,
        defaultValue: 100,
        description: 'Analysis threshold',
      },
    ],
    outputs: [
      {
        name: 'result',
        type: 'NativeData',
        description: 'Analysis result',
      },
    ],
    supportedDataTypes: ['geojson', 'shapefile'],
    requiredPermissions: ['read_file', 'write_file'],
  };
  
  private status: PluginStatus = 'initialized';
  
  async initialize(config?: any): Promise<void> {
    console.log('Initializing custom analysis plugin');
    this.status = 'active';
  }
  
  async execute(input: PluginInput): Promise<PluginOutput> {
    const { data, parameters } = input;
    
    // 验证输入
    if (data.length === 0) {
      throw new Error('No input data provided');
    }
    
    const inputData = data[0];
    const threshold = parameters.threshold || 100;
    
    // 加载数据
    const geojson = await this.loadData(inputData);
    
    // 执行自定义分析逻辑
    const result = this.performAnalysis(geojson, threshold);
    
    // 保存结果
    const resultData = await this.saveResult(result);
    
    return {
      data: resultData,
      metadata: {
        analysisType: 'custom',
        threshold: threshold,
        featureCount: result.features.length,
      },
    };
  }
  
  private async loadData(data: NativeData): Promise<any> {
    // 实现数据加载逻辑
    // ...
  }
  
  private performAnalysis(geojson: any, threshold: number): any {
    // 实现自定义分析逻辑
    // 例如：筛选满足条件的要素
    const filtered = {
      ...geojson,
      features: geojson.features.filter(f => {
        // 自定义筛选条件
        return turf.area(f) > threshold;
      }),
    };
    
    return filtered;
  }
  
  private async saveResult(result: any): Promise<NativeData> {
    // 实现结果保存逻辑
    // ...
  }
  
  async destroy(): Promise<void> {
    console.log('Destroying custom analysis plugin');
    this.status = 'inactive';
  }
  
  getStatus(): PluginStatus {
    return this.status;
  }
  
  setStatus(status: PluginStatus): void {
    this.status = status;
  }
}

// src/index.ts
export { CustomAnalysisPlugin };
```

### 4.3 package.json示例

```json
{
  "name": "geoai-up-custom-analysis-plugin",
  "version": "1.0.0",
  "description": "Custom spatial analysis plugin for GeoAI-UP",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "@turf/turf": "^7.3.0"
  },
  "devDependencies": {
    "typescript": "^6.0.0",
    "@types/node": "^24.0.0"
  },
  "geoai-up-plugin": {
    "category": "spatial_analysis",
    "minVersion": "1.0.0"
  }
}
```

### 4.4 插件打包和上传

```bash
# 构建插件
npm run build

# 打包为zip
zip -r custom-analysis-plugin.zip dist/ package.json README.md

# 通过前端上传到平台
# POST /api/plugins/upload
```

---

## 5. 插件加载和管理

### 5.1 PluginLoader实现

```typescript
class PluginLoader {
  private registry: PluginRegistry;
  private validator: PluginValidator;
  private logger: Logger;
  
  constructor(registry: PluginRegistry, validator: PluginValidator) {
    this.registry = registry;
    this.validator = validator;
    this.logger = new Logger('PluginLoader');
  }
  
  /**
   * 加载所有内置插件
   */
  async loadBuiltInPlugins(): Promise<Plugin[]> {
    const builtinDir = path.join(__dirname, '../plugins/builtin');
    const plugins: Plugin[] = [];
    
    const categories = await fs.readdir(builtinDir);
    
    for (const category of categories) {
      const categoryPath = path.join(builtinDir, category);
      const pluginDirs = await fs.readdir(categoryPath);
      
      for (const pluginDir of pluginDirs) {
        try {
          const pluginPath = path.join(categoryPath, pluginDir);
          const plugin = await this.loadPlugin(pluginPath);
          plugins.push(plugin);
          this.logger.info(`Loaded built-in plugin: ${plugin.name}`);
        } catch (error) {
          this.logger.error(`Failed to load plugin ${pluginDir}:`, error);
        }
      }
    }
    
    return plugins;
  }
  
  /**
   * 加载自定义插件
   */
  async loadCustomPlugins(): Promise<Plugin[]> {
    const customDir = path.join(__dirname, '../plugins/custom');
    const plugins: Plugin[] = [];
    
    if (!await fs.pathExists(customDir)) {
      return plugins;
    }
    
    const pluginFiles = await fs.readdir(customDir);
    
    for (const file of pluginFiles) {
      if (file.endsWith('.zip') || file.endsWith('.js')) {
        try {
          const pluginPath = path.join(customDir, file);
          const plugin = await this.loadPlugin(pluginPath);
          plugins.push(plugin);
          this.logger.info(`Loaded custom plugin: ${plugin.name}`);
        } catch (error) {
          this.logger.error(`Failed to load plugin ${file}:`, error);
        }
      }
    }
    
    return plugins;
  }
  
  /**
   * 加载单个插件
   */
  async loadPlugin(pluginPath: string): Promise<Plugin> {
    let pluginModule: any;
    
    if (pluginPath.endsWith('.zip')) {
      // 解压zip文件
      const extractPath = await this.extractZip(pluginPath);
      pluginModule = await import(extractPath);
    } else if (pluginPath.endsWith('.js')) {
      // 直接加载JS文件
      pluginModule = await import(pluginPath);
    } else {
      // 加载目录
      pluginModule = await import(pluginPath);
    }
    
    // 获取插件类
    const PluginClass = pluginModule.default || Object.values(pluginModule)[0];
    
    if (!PluginClass) {
      throw new Error('No plugin class found');
    }
    
    // 实例化插件
    const plugin: Plugin = new PluginClass();
    
    // 验证插件
    const validation = this.validator.validate(plugin);
    if (!validation.valid) {
      throw new Error(`Plugin validation failed: ${validation.errors.join(', ')}`);
    }
    
    // 注册插件
    this.registry.register(plugin);
    
    // 初始化插件
    await plugin.initialize();
    
    return plugin;
  }
  
  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.registry.getPlugin(pluginId);
    
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    // 销毁插件
    await plugin.destroy();
    
    // 从注册表中移除
    this.registry.unregister(pluginId);
    
    this.logger.info(`Unloaded plugin: ${plugin.name}`);
  }
  
  private async extractZip(zipPath: string): Promise<string> {
    // 实现zip解压逻辑
    // ...
  }
}
```

### 5.2 PluginValidator实现

```typescript
class PluginValidator {
  validate(plugin: Plugin): ValidationResult {
    const errors: string[] = [];
    
    // 验证必需字段
    if (!plugin.id) errors.push('Missing plugin id');
    if (!plugin.name) errors.push('Missing plugin name');
    if (!plugin.version) errors.push('Missing plugin version');
    if (!plugin.category) errors.push('Missing plugin category');
    
    // 验证版本格式
    if (plugin.version && !this.isValidSemver(plugin.version)) {
      errors.push('Invalid version format');
    }
    
    // 验证元数据
    if (!plugin.metadata) {
      errors.push('Missing plugin metadata');
    } else {
      if (!plugin.metadata.inputs) errors.push('Missing metadata.inputs');
      if (!plugin.metadata.outputs) errors.push('Missing metadata.outputs');
      if (!plugin.metadata.supportedDataTypes) {
        errors.push('Missing metadata.supportedDataTypes');
      }
    }
    
    // 验证必需方法
    if (typeof plugin.initialize !== 'function') {
      errors.push('Missing initialize method');
    }
    if (typeof plugin.execute !== 'function') {
      errors.push('Missing execute method');
    }
    if (typeof plugin.destroy !== 'function') {
      errors.push('Missing destroy method');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  private isValidSemver(version: string): boolean {
    return /^\d+\.\d+\.\d+$/.test(version);
  }
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

### 5.3 PluginRegistry实现

```typescript
class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();
  
  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }
    
    this.plugins.set(plugin.id, plugin);
  }
  
  unregister(pluginId: string): void {
    if (!this.plugins.has(pluginId)) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    this.plugins.delete(pluginId);
  }
  
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }
  
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
  
  getPluginsByCategory(category: PluginCategory): Plugin[] {
    return Array.from(this.plugins.values())
      .filter(p => p.category === category);
  }
  
  hasPlugin(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }
  
  getPluginCount(): number {
    return this.plugins.size;
  }
}
```

---

## 6. 插件执行流程

### 6.1 单次插件执行

```
PluginExecutor.execute(step, context)
    ↓
获取插件实例: registry.getPlugin(step.pluginName)
    ↓
验证插件状态: plugin.getStatus() === 'active'
    ↓
准备输入数据: PluginInput
    ↓
执行插件: plugin.execute(input)
    ↓
验证输出: PluginOutput
    ↓
记录执行结果: ExecutionResult
    ↓
返回结果
```

### 6.2 并行执行多个步骤

```typescript
class PluginExecutor {
  async executeParallel(
    steps: ExecutionStep[], 
    context: ExecutionContext
  ): Promise<ExecutionResult[]> {
    // 过滤出无依赖的步骤
    const independentSteps = steps.filter(step => 
      step.dependencies.length === 0
    );
    
    // 并行执行
    const promises = independentSteps.map(step => 
      this.executeStep(step, context)
    );
    
    return await Promise.all(promises);
  }
  
  async executeWithDependencies(
    plan: ExecutionPlan, 
    context: ExecutionContext
  ): Promise<ExecutionResult[]> {
    const results: Map<string, ExecutionResult> = new Map();
    
    // 拓扑排序执行
    const executed = new Set<string>();
    
    while (executed.size < plan.steps.length) {
      // 找到可执行的步骤（所有依赖已执行）
      const readySteps = plan.steps.filter(step => 
        !executed.has(step.id) &&
        step.dependencies.every(dep => executed.has(dep))
      );
      
      if (readySteps.length === 0) {
        throw new Error('Circular dependency detected');
      }
      
      // 并行执行就绪的步骤
      const promises = readySteps.map(async step => {
        const result = await this.executeStep(step, context);
        results.set(step.id, result);
        executed.add(step.id);
        return result;
      });
      
      await Promise.all(promises);
    }
    
    return Array.from(results.values());
  }
  
  private async executeStep(
    step: ExecutionStep, 
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      // 获取插件
      const plugin = this.registry.getPlugin(step.pluginName);
      if (!plugin) {
        throw new Error(`Plugin not found: ${step.pluginName}`);
      }
      
      if (plugin.getStatus() !== 'active') {
        throw new Error(`Plugin is not active: ${step.pluginName}`);
      }
      
      // 准备输入
      const input = await this.prepareInput(step, context, results);
      
      // 执行插件
      const output = await plugin.execute(input);
      
      const executionTime = Date.now() - startTime;
      
      return {
        stepId: step.id,
        success: true,
        data: output.data,
        executionTime,
        metadata: output.metadata,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        stepId: step.id,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        executionTime,
        metadata: {},
      };
    }
  }
}
```

---

## 7. 插件安全性和沙箱

### 7.1 权限控制

```typescript
class PermissionManager {
  private grantedPermissions: Map<string, Set<Permission>> = new Map();
  
  grantPermission(pluginId: string, permission: Permission): void {
    if (!this.grantedPermissions.has(pluginId)) {
      this.grantedPermissions.set(pluginId, new Set());
    }
    this.grantedPermissions.get(pluginId)!.add(permission);
  }
  
  checkPermission(pluginId: string, permission: Permission): boolean {
    const permissions = this.grantedPermissions.get(pluginId);
    return permissions?.has(permission) || false;
  }
  
  revokePermission(pluginId: string, permission: Permission): void {
    const permissions = this.grantedPermissions.get(pluginId);
    permissions?.delete(permission);
  }
}
```

### 7.2 资源限制

```typescript
interface ResourceLimits {
  maxExecutionTime: number;      // 最大执行时间（毫秒）
  maxMemoryUsage: number;        // 最大内存使用（字节）
  maxFileSize: number;           // 最大文件大小（字节）
  maxNetworkRequests: number;    // 最大网络请求数
}

class ResourceManager {
  enforceLimits(pluginId: string, limits: ResourceLimits): void {
    // 监控插件资源使用
    // 超出限制时终止执行
  }
}
```

---

## 8. 插件版本管理

### 8.1 版本兼容性

```typescript
interface PluginCompatibility {
  minPlatformVersion: string;
  maxPlatformVersion?: string;
  dependencies: {
    [pluginId: string]: string;  // 语义化版本范围
  };
}

class VersionManager {
  checkCompatibility(
    plugin: Plugin, 
    platformVersion: string
  ): CompatibilityResult {
    // 检查插件与平台的兼容性
    // 检查依赖版本冲突
  }
}
```

### 8.2 插件更新策略

- **向后兼容**: 小版本更新应保持API兼容
- **迁移指南**: 大版本更新提供迁移文档
- **灰度发布**: 支持逐步 rollout 新版本

---

## 9. 插件调试和日志

### 9.1 插件日志

```typescript
class PluginLogger {
  private pluginId: string;
  private logger: Logger;
  
  constructor(pluginId: string) {
    this.pluginId = pluginId;
    this.logger = new Logger(`Plugin:${pluginId}`);
  }
  
  debug(message: string, context?: any): void {
    this.logger.debug(message, { pluginId: this.pluginId, ...context });
  }
  
  info(message: string, context?: any): void {
    this.logger.info(message, { pluginId: this.pluginId, ...context });
  }
  
  warn(message: string, context?: any): void {
    this.logger.warn(message, { pluginId: this.pluginId, ...context });
  }
  
  error(message: string, error?: Error, context?: any): void {
    this.logger.error(message, error, { pluginId: this.pluginId, ...context });
  }
}
```

### 9.2 性能监控

```typescript
interface PluginMetrics {
  pluginId: string;
  executionCount: number;
  averageExecutionTime: number;
  successRate: number;
  lastExecutedAt?: Date;
  errorCount: number;
}

class PluginMetricsCollector {
  recordExecution(pluginId: string, duration: number, success: boolean): void {
    // 记录执行指标
  }
  
  getMetrics(pluginId: string): PluginMetrics {
    // 获取插件指标
  }
}
```

---

**文档版本**: 1.0  
**最后更新**: 2026-05-03  
**作者**: GeoAI-UP Architecture Team  
**审核状态**: Draft
