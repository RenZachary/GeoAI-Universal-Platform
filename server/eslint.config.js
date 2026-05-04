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
            {
              group: ['**/data-access/accessors/*'],
              message: "⚠️ 建议通过 data-access/index 导入访问器，除非有特殊需求"
            },
            {
              group: ['**/data-access/repositories/*'],
              message: "⚠️ 建议通过 data-access/index 导入仓库类，除非有特殊需求"
            },
            
            // === Plugin Orchestration Layer ===
            {
              group: ['**/plugin-orchestration/plugins/*'],
              message: "⚠️ 插件定义应通过 plugin-orchestration/index 导入"
            },
            {
              group: ['**/plugin-orchestration/executor/*'],
              message: "⚠️ 执行器应通过 plugin-orchestration/index 导入"
            },
            
            // === LLM Interaction Layer ===
            {
              group: ['**/llm-interaction/adapters/*'],
              message: "⚠️ 建议通过 llm-interaction/index 导入适配器"
            },
            {
              group: ['**/llm-interaction/managers/*'],
              message: "⚠️ 建议通过 llm-interaction/index 导入管理器"
            },
            {
              group: ['**/llm-interaction/agents/*'],
              message: "⚠️ 建议通过 llm-interaction/index 导入 Agent"
            },
            {
              group: ['**/llm-interaction/workflow/*'],
              message: "⚠️ 建议通过 llm-interaction/index 导入工作流"
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
