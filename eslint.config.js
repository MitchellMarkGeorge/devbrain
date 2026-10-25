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
    files: ['src/main/**/*.{ts,mjs}', 'src/preload/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Main process database access is synchronous (better-sqlite3); see "Database access" in
  // CLAUDE.md. Type-aware, so it can tell a Promise from a plain value.
  {
    files: ['src/main/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.node.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // awaiting a method that returns a plain value, e.g. a service method that only reads rows
      '@typescript-eslint/await-thenable': 'error',
      // a Drizzle query is thenable, so await-thenable allows it: catch the await syntactically
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'AwaitExpression > CallExpression[callee.property.name=/^(from|where|orderBy|groupBy|having|limit|offset|innerJoin|leftJoin|values|set|returning|onConflictDoUpdate|onConflictDoNothing)$/]',
          message:
            'better-sqlite3 is synchronous: end the query with .all(), .get() or .run() instead of awaiting it.',
        },
      ],
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
