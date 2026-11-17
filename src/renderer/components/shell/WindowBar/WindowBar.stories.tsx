import type { Meta, StoryObj } from '@storybook/react-vite';
import { TooltipProvider } from '../../ui/Tooltip';
import { WindowFrameProvider, type Platform } from '../../lib/platform';
import { WorkspaceButton, WorkspaceSwitcher } from '../WorkspaceSwitcher';
import {
  AppMenuButton,
  CaptionButtons,
  HistoryControls,
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

const WORKSPACES = [
  { id: 'surveymonkey', name: 'SurveyMonkey', color: 'green' as const },
  { id: 'personal', name: 'Personal', color: 'blue' as const },
];

/** The bar as `WorkspaceShell` sizes it: the sidebar's width, on the sidebar's colour. */
function Bar({ name = 'SurveyMonkey' }: { name?: string }) {
  return (
    <WindowBar
      style={{ width: 'var(--sidebar-width)', background: 'var(--sidebar)' }}
      workspace={
        <WorkspaceButton name={name} color="green">
          <WorkspaceSwitcher workspaces={WORKSPACES} current="surveymonkey" />
        </WorkspaceButton>
      }
    />
  );
}

/**
 * The title bar's start on the toolbar's platform: the window's start, the workspace switcher, and
 * the sidebar toggle at the end. `WorkspaceShell` puts back, forward, the search field and New
 * after it, then the page's actions.
 */
export const Default: Story = { render: () => <Bar /> };

/** A long workspace name is cut short; the toggle stays at the sidebar's edge. */
export const LongName: Story = { render: () => <Bar name="Developer Platform Team" /> };

/** The bar on each platform. On Windows the caption buttons are painted here, as `WorkspaceShell` does. */
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
 * button and caption buttons, the sidebar toggle, and back and forward.
 */
export const Parts: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: 16 }}>
      <TrafficLights drawn />
      <TrafficLights drawn={false} style={{ outline: '1px dashed var(--border)' }} />
      <AppMenuButton />
      <CaptionButtons />
      <WindowControls />
      <HistoryControls />
    </div>
  ),
};
