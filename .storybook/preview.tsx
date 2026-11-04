import { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';
import '../src/renderer/styles/fonts.css';
import '../src/renderer/styles/tokens.css';
import '../src/renderer/styles/base.css';
import './preview.css';

type Theme = 'system' | 'dark' | 'light';

// Pins the theme with data-theme on <html>, which tokens.css (and the few component rules that
// differ by theme) honour over prefers-color-scheme. "System" removes it, as in the app.
const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme ?? 'system') as Theme;
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
  return <Story />;
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'system', title: 'System', icon: 'browser' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
          { value: 'light', title: 'Light', icon: 'sun' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'system' },
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    // the page is the theme's `background`, so Storybook's own backgrounds stay off
    backgrounds: { disable: true },
  },
};

export default preview;
