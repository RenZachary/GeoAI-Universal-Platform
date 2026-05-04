# ESLint 配置说明

## 📋 概述

本项目使用 ESLint v10.x + TypeScript ESLint 进行代码质量检查，采用新的 **Flat Config** 格式（`eslint.config.js`）。

## 🎯 核心规则

### 1. 模块导入规范（强制）

**原则**: 所有模块必须通过统一的 `index.ts` 入口导入，禁止直接访问内部文件。

#### Core Module
```typescript
// ❌ 错误
import { DataSourceType } from '../core/types';
import { generateId } from '../core/utils/helpers';

// ✅ 正确
import { DataSourceType, generateId } from '../core';
```

#### Data Access Layer
```typescript
// ⚠️ 警告（建议但不强制）
import { GeoJSONAccessor } from '../data-access/accessors/GeoJSONAccessor';

// ✅ 推荐
import { GeoJSONAccessor } from '../data-access';
```

#### 其他模块
- Plugin Orchestration: 通过 `plugin-orchestration/index` 导入
- LLM Interaction: 通过 `llm-interaction/index` 导入
- Storage: 通过 `storage/index` 导入

### 2. 文件扩展名规范

```typescript
// ❌ 错误 - 不需要 .js 扩展名
import { something } from './module.js';

// ✅ 正确 - ES2020 + bundler 模式自动处理
import { something } from './module';
```

### 3. 类型导入规范

```typescript
// ✅ 推荐 - 纯类型使用 import type
import type { DataSourceType } from '../core';
import { someFunction } from '../core';

// ✅ 也可以混合使用
import { type DataSourceType, someFunction } from '../core';
```

### 4. 错误处理规范

```typescript
// ✅ 正确 - 保留原始错误信息
try {
  // ...
} catch (error) {
  const wrappedError = new Error('Custom message');
  (wrappedError as any).cause = error;
  throw wrappedError;
}
```

### 5. 异步代码规范

```typescript
// ❌ 错误 - 未处理的 Promise
someAsyncFunction();

// ✅ 正确 - 必须 await 或 .catch()
await someAsyncFunction();
someAsyncFunction().catch(console.error);
```

## 🔧 配置特性

### 启用的主要规则

| 规则 | 级别 | 说明 |
|------|------|------|
| `no-restricted-imports` | error | 限制直接导入内部模块 |
| `@typescript-eslint/consistent-type-imports` | warn | 强制类型导入使用 `import type` |
| `@typescript-eslint/no-floating-promises` | error | 必须处理 Promise |
| `@typescript-eslint/no-explicit-any` | warn | 警告 any 类型 |
| `eqeqeq` | warn | 强制使用 `===` |
| `prefer-const` | warn | 优先使用 const |
| `no-var` | error | 禁止使用 var |

### 命名规范

- **Interface**: PascalCase（如 `DataSourceConfig`）
- **Type Alias**: PascalCase（如 `DataSourceType`）
- **Enum**: PascalCase（如 `PluginCategory`）

## 📝 VSCode 集成

已配置 `.vscode/settings.json`，实现：
- ✅ 保存时自动修复 ESLint 问题
- ✅ 保存时自动整理 imports
- ✅ 输入时实时检查

## 🚀 常用命令

```bash
# 检查所有文件
npm run lint

# 自动修复可修复的问题
npm run lint -- --fix

# 检查特定文件
npm run lint -- src/api/controllers/DataSourceController.ts
```

## ⚙️ 配置结构

```javascript
export default tseslint.config(
  js.configs.recommended,           // JavaScript 基础规则
  ...tseslint.configs.recommended,  // TypeScript 基础规则
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,       // 启用类型感知
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // 自定义规则...
    }
  },
  {
    // 测试文件特殊配置
    files: ['tests/**/*.ts'],
    rules: { /* ... */ }
  },
  {
    // 忽略的文件
    ignores: ['dist/**', 'node_modules/**']
  }
);
```

## 🔍 常见问题

### Q1: 为什么 IDE 没有显示 ESLint 错误？

**解决方案**:
1. 确保安装了 VSCode ESLint 插件
2. 重启 ESLint 服务器: `Ctrl+Shift+P` → "ESLint: Restart ESLint Server"
3. 检查输出面板: `Ctrl+Shift+U` → 选择 "ESLint"

### Q2: 如何临时禁用某个规则？

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = getData();
```

### Q3: 为什么某些规则需要类型信息？

一些高级规则（如 `no-floating-promises`）需要 TypeScript 类型信息进行准确分析。已通过 `parserOptions.projectService` 启用。

## 📚 参考资源

- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files-new)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [项目架构文档](../docs/architecture/)

---

**最后更新**: 2026-05-04
**维护者**: GeoAI-UP Team
