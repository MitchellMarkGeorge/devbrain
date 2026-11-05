import type { Meta, StoryObj } from '@storybook/react-vite';
import { List } from 'lucide-react';
import { Breadcrumb } from '../../ui/Breadcrumb';
import { PageFavoriteButton, PageHeader, PageHeaderInWindowBar } from '../PageHeader';
import { TooltipProvider } from '../../ui/Tooltip';
import { WindowFrameProvider, type Platform } from '../../lib/platform';
import {
  AppMenuButton,
  CaptionButtons,
  TrafficLights,
  WindowBar,
  WindowControls,
} from './WindowBar';

const meta = {
  title: 'Shell/WindowBar',
  component: WindowBar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof WindowBar>;

export default meta;
type Story = StoryObj<typeof meta>;

function Bar() {
  return (
    <PageHeaderInWindowBar.Provider value>
      <WindowBar>
        <PageHeader actions={<PageFavoriteButton favorite={false} />}>
          <Breadcrumb items={['Tasks', { label: 'List', icon: List }]} />
        </PageHeader>
      </WindowBar>
    </PageHeaderInWindowBar.Provider>
  );
}

/**
 * The hidden sidebar's bar on the toolbar's platform: the title bar's start, sidebar toggle,
 * back and forward, then the page's header.
 */
export const Default: Story = { render: () => <Bar /> };

/** The bar on each platform. On Windows the caption buttons are painted here, as `AppShell` does. */
export const Platforms: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {(['macos', 'windows', 'linux'] as Platform[]).map((platform) => (
        <WindowFrameProvider key={platform} value={{ platform, controls: 'drawn' }}>
          <div data-platform={platform} style={{ position: 'relative' }}>
            <Bar />
            {platform === 'windows' && (
              <CaptionButtons style={{ position: 'absolute', top: 0, right: 0 }} />
            )}
          </div>
        </WindowFrameProvider>
      ))}
    </div>
  ),
};

/**
 * The parts: the traffic lights' slot (painted, and reserved as in the app), the Windows menu
 * button and caption buttons, and the controls.
 */
export const Parts: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: 16 }}>
      <TrafficLights drawn />
      <TrafficLights drawn={false} style={{ outline: '1px dashed var(--border)' }} />
      <AppMenuButton />
      <CaptionButtons />
      <WindowControls />
    </div>
  ),
};
