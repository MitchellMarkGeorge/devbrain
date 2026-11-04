import type { Preview } from '@storybook/react-vite';
import '../src/renderer/styles/tokens.css';
import '../src/renderer/styles/base.css';
import './preview.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    // the page is the theme's `background`; the light theme follows prefers-color-scheme
    backgrounds: { disable: true },
  },
};

export default preview;
