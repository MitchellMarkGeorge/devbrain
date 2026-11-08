import { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';
import { FormatProvider } from '../src/renderer/components/lib/format';
import { WindowFrameProvider, type Platform } from '../src/renderer/components/lib/platform';
import { STORY_NOW } from '../src/renderer/components/lib/story-dates';
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

// The window frame stories draw: the platform from the toolbar, with the window controls painted
// (the system draws them in the app), and no menu to open
const withWindowFrame: Decorator = (Story, context) => {
  const platform = (context.globals.platform ?? 'macos') as Platform;
  return (
    <WindowFrameProvider value={{ platform, controls: 'drawn' }}>
      <Story />
    </WindowFrameProvider>
  );
};

// A fixed `now` (22 Jun 2026, 9:48 AM, as the designed screens use), so "Today" and "In 12m"
// read the same every day. A story can pass its own with `parameters.now`, and pick the time
// format with the toolbar
const withFormat: Decorator = (Story, context) => {
  const now = (context.parameters.now as Date | undefined) ?? STORY_NOW;
  const timeFormat = (context.globals.timeFormat ?? '12') as '12' | '24';
  return (
    <FormatProvider now={now} timeFormat={timeFormat}>
      <Story />
    </FormatProvider>
  );
};

const preview: Preview = {
  decorators: [withTheme, withWindowFrame, withFormat],
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
    platform: {
      description: 'Platform: who draws the window controls, and how keys are named',
      toolbar: {
        title: 'Platform',
        icon: 'browser',
        items: [
          { value: 'macos', title: 'macOS' },
          { value: 'windows', title: 'Windows' },
          { value: 'linux', title: 'Linux' },
        ],
        dynamicTitle: true,
      },
    },
    timeFormat: {
      description: 'Clock: 12 or 24 hour times',
      toolbar: {
        title: 'Clock',
        icon: 'time',
        items: [
          { value: '12', title: '12 hour' },
          { value: '24', title: '24 hour' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'system', platform: 'macos', timeFormat: '12' },
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    // the page is the theme's `background`, so Storybook's own backgrounds stay off
    backgrounds: { disable: true },
  },
};

export default preview;
