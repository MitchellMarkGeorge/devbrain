import { useEffect } from 'react';
import type { Preview } from '@storybook/react-vite';
import { ToastProvider } from '../src/renderer/components/ui';
import '../src/renderer/styles/tokens.css';
import '../src/renderer/styles/base.css';
const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: { icon: 'paintbrush', items: ['dark', 'light', 'system'], dynamicTitle: true },
    },
  },
  decorators: [
    (Story, context) => {
      useEffect(() => {
        const theme = context.globals.theme;
        if (theme === 'system') delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = theme;
      }, [context.globals.theme]);
      return (
        <ToastProvider>
          <div style={{ padding: 'var(--space-4)' }}>
            <Story />
          </div>
        </ToastProvider>
      );
    },
  ],
  parameters: {
    layout: 'padded',
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'error' },
    options: {
      storySort: {
        order: [
          'Foundations',
          'Controls',
          'Overlays',
          'Content',
          'Planning',
          'Navigation',
          'Examples',
        ],
      },
    },
  },
  initialGlobals: { theme: 'dark' },
};
export default preview;
