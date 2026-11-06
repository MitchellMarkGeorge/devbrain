import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import storybook from 'eslint-plugin-storybook';

// main's code never runs in the renderer: it imports from src/main only as a type
// (`import type { AppRouter }`). Vite would bundle a value import, Electron with it
const mainTypeOnly = {
  group: ['@main/*', '**/main/*'],
  allowTypeImports: true,
  message: 'The renderer imports from src/main as a type only (import type).',
};

// The component groups above `ui` and `entities` (src/renderer/components/README.md)
const FEATURE_GROUPS = [
  'shell',
  'lists',
  'board',
  'detail',
  'editor',
  'calendar',
  'home',
  'projects',
  'notes',
  'integrations',
  'settings',
  'onboarding',
  'screens',
];
const notFrom = (groups, message) => ({
  group: groups.flatMap((g) => [
    `**/components/${g}`,
    `**/components/${g}/**`,
    `../../${g}`,
    `../../${g}/**`,
  ]),
  message,
});

export default tseslint.config(
  // Ignore build output and generated files
  {
    ignores: ['dist/**', 'node_modules/**', 'docs/design-system/reference/**'],
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
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [mainTypeOnly] }],
    },
  },

  // Components build on the groups below them: layout and ui know nothing of DevBrain's
  // entities, and entities nothing of the screens' components. Stories may use anything
  {
    files: ['src/renderer/components/{layout,lib,ui}/**/*.{ts,tsx}'],
    ignores: ['**/*.stories.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            mainTypeOnly,
            notFrom(
              ['entities', ...FEATURE_GROUPS],
              'layout and ui components are generic: they import only from layout, ui, lib and types.',
            ),
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/components/entities/**/*.{ts,tsx}'],
    ignores: ['**/*.stories.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            mainTypeOnly,
            notFrom(
              FEATURE_GROUPS,
              'entities components are shared by every screen: they import only from entities, ui, layout, lib and types.',
            ),
          ],
        },
      ],
    },
  },

  // src/common is bundled into the renderer as well as main: it imports only other src/common
  // files and zod (and small libraries such as uuid), never main, Drizzle, Electron or Node
  {
    files: ['src/common/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@main/*', '**/main/*', '**/main/**'],
              message: 'src/common is shared with the renderer: it never imports from src/main.',
            },
            {
              group: ['drizzle-orm', 'drizzle-orm/*', 'better-sqlite3', 'electron', 'electron/*'],
              message: 'src/common is bundled into the renderer: no Drizzle, SQLite or Electron.',
            },
            {
              regex: '^node:',
              message: 'src/common is bundled into the renderer: no Node modules.',
            },
          ],
        },
      ],
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

  // Vite config files
  {
    files: ['vite.*.config.ts', 'scripts/**/*.{ts,mts,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Storybook stories and config
  ...storybook.configs['flat/recommended'],

  // Disable ESLint formatting rules that conflict with Prettier (must be last)
  prettierConfig,
);
