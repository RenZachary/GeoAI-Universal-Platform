import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // 🔥 核心规则：禁止直接导入内部模块，必须通过 index.ts 统一导出
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // === Core Module ===
            {
              group: ['**/core/types', '**/core/types/*'],
              message: "❌ 禁止直接导入 core/types！请使用: import { ... } from '../core'"
            },
            {
              group: ['**/core/constants', '**/core/constants/*'],
              message: "❌ 禁止直接导入 core/constants！请使用: import { ... } from '../core'"
            },
            {
              group: ['**/core/utils', '**/core/utils/*'],
              message: "❌ 禁止直接导入 core/utils！请使用: import { ... } from '../core'"
            },
            
            // === Data Access Layer ===
            // 📌 通用规则：优先通过 index.ts 统一导出
            {
              group: ['**/data-access/accessors/*'],
              message: "⚠️ 访问器应通过 data-access/index 导入，除非在 factories 中需要"
            },
            {
              group: ['**/data-access/repositories/*'],
              message: "⚠️ 仓库类应通过 data-access/index 导入"
            },
            {
              group: ['**/data-access/factories/*'],
              message: "⚠️ 工厂类应通过 data-access/index 导入"
            },
            {
              group: ['**/data-access/utils/*'],
              message: "⚠️ 工具类应通过 data-access/index 导入"
            },
            
            // 📌 内部模块隔离规则（防止循环依赖和架构混乱）
            {
              // accessors 不应该导入 repositories
              group: ['**/data-access/accessors/**/../*/repositories/**'],
              message: "❌ 访问器层不应直接导入仓库层！访问器负责数据读取，仓库负责元数据管理"
            },
            {
              // repositories 不应该导入 accessors
              group: ['**/data-access/repositories/**/../*/accessors/**'],
              message: "❌ 仓库层不应直接导入访问器层！仓库只管理元数据，不处理数据内容"
            },
            
            // === Plugin Orchestration Layer ===
            // 📌 通用规则：优先通过 index.ts 统一导出
            {
              group: ['**/plugin-orchestration/plugins/*'],
              message: "⚠️ 插件定义应通过 plugin-orchestration/index 导入，除非在 registration 文件中"
            },
            {
              group: ['**/plugin-orchestration/executor/*'],
              message: "⚠️ 执行器应通过 plugin-orchestration/index 导入，除非在 registration 文件中"
            },
            
            // 📌 内部模块隔离规则（防止循环依赖和架构混乱）
            {
              // plugins 不应该直接导入 executor
              group: ['**/plugin-orchestration/plugins/**/../*/executor/**'],
              message: "❌ 插件定义层不应直接导入执行器层！插件只包含元数据，执行逻辑在执行器中"
            },
            {
              // executor 不应该直接导入 plugins
              group: ['**/plugin-orchestration/executor/**/../*/plugins/**'],
              message: "❌ 执行器层不应直接导入插件定义！通过 Plugin 类型接口解耦"
            },
            {
              // registry 不应该被 registration 以外的地方直接导入
              group: ['**/plugin-orchestration/registry/*'],
              message: "⚠️ 注册表类应通过 plugin-orchestration/index 导入，除非在 registration 文件中"
            },
            {
              // loader 应该通过 index 导入
              group: ['**/plugin-orchestration/loader/*'],
              message: "⚠️ 加载器应通过 plugin-orchestration/index 导入"
            },
            {
              // tools 应该通过 index 导入
              group: ['**/plugin-orchestration/tools/*'],
              message: "⚠️ 工具类应通过 plugin-orchestration/index 导入"
            },
            
            // 📌 registration 目录特殊规则
            {
              // registration 文件可以导入 registry 和 executor/plugins
              // 但其他文件不应该导入 registration
              group: ['**/plugin-orchestration/registration/*'],
              message: "❌ registration 文件仅用于启动时批量注册，不应被业务代码导入！请使用导出的函数"
            },
            
            // === LLM Interaction Layer ===
            // 📌 通用规则：优先通过 index.ts 统一导出
            {
              group: ['**/llm-interaction/adapters/*'],
              message: "⚠️ 适配器应通过 llm-interaction/index 导入，除非在 workflow 或 agents 中需要"
            },
            {
              group: ['**/llm-interaction/managers/*'],
              message: "⚠️ 管理器应通过 llm-interaction/index 导入，除非在 workflow 或 agents 中需要"
            },
            {
              group: ['**/llm-interaction/agents/*'],
              message: "⚠️ Agent 应通过 llm-interaction/index 导入，除非在 workflow 中需要"
            },
            {
              group: ['**/llm-interaction/workflow/*'],
              message: "⚠️ 工作流组件应通过 llm-interaction/index 导入"
            },
            {
              group: ['**/llm-interaction/handlers/*'],
              message: "⚠️ 处理器应通过 llm-interaction/index 导入"
            },
            
            // 📌 内部模块隔离规则（防止循环依赖）
            {
              // agents 不应该直接导入 workflow（除了 GeoAIGraph）
              group: ['**/llm-interaction/agents/**/../*/workflow/**', '!**/llm-interaction/agents/**/../*/workflow/GeoAIGraph*'],
              message: "❌ Agents 不应直接导入 workflow 组件！通过 GeoAIGraph 统一协调"
            },
            {
              // workflow 中的组件不应该相互直接导入（除了 GeoAIGraph）
              group: ['**/llm-interaction/workflow/{PlaceholderResolver,ServicePublisher,SummaryGenerator}/**/../*/workflow/**'],
              message: "⚠️ Workflow 组件应通过 GeoAIGraph 协调，避免直接相互依赖"
            },
            {
              // handlers 不应该导入 agents 或 workflow
              group: ['**/llm-interaction/handlers/**/../*/{agents,workflow}/**'],
              message: "❌ Handlers 不应直接导入 Agents 或 Workflow！保持层次分离"
            },
            
            // === Storage Layer ===
            {
              group: ['**/storage/filesystem/*'],
              message: "⚠️ 建议通过 storage/index 导入文件系统管理"
            },
            {
              group: ['**/storage/database/*'],
              message: "⚠️ 建议通过 storage/index 导入数据库管理"
            },
            
            // === 通用规则 ===
            {
              // 禁止带 .js 扩展名的导入（ES2020 + bundler 模式不需要）
              regex: "\\.js['\"]$",
              message: "⚠️ 在 ES2020 + bundler 模式下不需要 .js 扩展名，请移除"
            }
          ]
        }
      ],
      
      // 🔥 TypeScript 类型导入规范
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false
        }
      ],
      
      // 🔥 代码质量规则
      'no-console': 'off', // 允许 console（服务器端日志）
      'no-debugger': 'warn', // 警告 debugger 语句
      
      // 🔥 TypeScript 特定规则
      '@typescript-eslint/no-explicit-any': 'warn', // 警告 any 类型使用
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn', // 警告 ! 断言
      '@typescript-eslint/prefer-as-const': 'warn', // 推荐使用 as const
      
      // 🔥 最佳实践
      'prefer-const': 'warn', // 优先使用 const
      'no-var': 'error', // 禁止使用 var
      'eqeqeq': ['warn', 'always'], // 强制使用 === 和 !==
      
      // 🔥 异步代码规范
      '@typescript-eslint/no-floating-promises': 'error', // 必须处理 Promise
      '@typescript-eslint/promise-function-async': 'off', // 不强制 async
      
      // 🔥 接口和类型定义
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off', // 不强制返回类型注解
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      
      // 🔥 命名规范
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'interface',
          format: ['PascalCase']
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase']
        },
        {
          selector: 'enum',
          format: ['PascalCase']
        }
      ]
    }
  },
  {
    // 测试文件特殊配置
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  {
    // 忽略的文件和目录
    ignores: [
      'dist/**',
      'node_modules/**',
      'tests/**',
      '*.js',
      '*.d.ts'
    ]
  }
);
