import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

// Storybook for the renderer's components, built with Vite like the renderer itself.
const config: StorybookConfig = {
  stories: ['../src/renderer/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  // the renderer's Vite config sets `root: src/renderer`; Storybook needs its own root, so only
  // the alias is shared
  async viteFinal(config) {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@common': fileURLToPath(new URL('../src/common', import.meta.url)),
    };
    return config;
  },
};

export default config;
