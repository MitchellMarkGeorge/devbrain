import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // Ignore build output and generated files
  {
    ignores: ['dist/**', 'node_modules/**'],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules (all source files)
  ...tseslint.configs.recommended,

  // React renderer files
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // not needed with React 17+ JSX transform
    },
  },

  // Main process and preload (Node environment)
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Vite config files
  {
    files: ['vite.*.config.ts', 'scripts/**/*.{ts,mts}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Disable ESLint formatting rules that conflict with Prettier (must be last)
  prettierConfig,
);
