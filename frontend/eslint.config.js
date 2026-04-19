// eslint.config.js  — ESLint flat config (ESLint v9+)
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'

export default [
  // 忽略构建产物
  {
    ignores: ['dist/**', 'node_modules/**', '*.d.ts'],
  },

  // JS 基础规则
  js.configs.recommended,

  // Vue 3 推荐规则
  ...pluginVue.configs['flat/recommended'],

  // TypeScript + Vue 文件
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: {
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        URLSearchParams: 'readonly',
        HTMLElement: 'readonly',
        ResizeObserver: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
      },
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // TS 推荐规则子集（不启用 strict，保持项目友好）
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      // Vue 规则调整
      'vue/multi-word-component-names': 'off',   // 单词组件名不强制
      'vue/no-unused-vars': 'warn',
      'vue/html-self-closing': ['warn', {
        html: { void: 'always', normal: 'never', component: 'always' },
      }],

      // 通用规则
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': 'off',   // 由 TS 规则代替
    },
  },
]
