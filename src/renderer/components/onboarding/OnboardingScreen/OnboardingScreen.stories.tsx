import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleHelp, Folder, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Logomark } from '../../ui/Logomark';
import { OnboardingScreen } from './OnboardingScreen';
import { WindowFrameProvider } from '../../lib/platform';

const meta = {
  title: 'Onboarding/OnboardingScreen',
  component: OnboardingScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OnboardingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma "Welcome (no workspace)". */
export const NoWorkspace: Story = {
  args: {
    logo: <Logomark size="md" />,
    title: 'Welcome to DevBrain',
    description: 'Your tasks, notes and calendar in one place, stored on this Mac.',
    footer: (
      <Button variant="ghost" size="sm" icon={CircleHelp}>
        What’s a workspace?
      </Button>
    ),
    children: (
      <div style={{ display: 'flex', gap: 8 }}>
        <Button icon={Plus}>Create Workspace</Button>
        <Button icon={Folder}>Open Existing Folder…</Button>
      </div>
    ),
  },
};

/** Figma "Splash": the pulsing mark alone. */
export const Splash: Story = {
  args: { logo: <Logomark size="lg" pulse /> },
};

/** Windows: the menu button at the left of the strip, Windows' caption buttons (painted) at its right. */
export const Windows: Story = {
  args: NoWorkspace.args,
  decorators: [
    (Story) => (
      <WindowFrameProvider value={{ platform: 'windows', controls: 'drawn' }}>
        <Story />
      </WindowFrameProvider>
    ),
  ],
};

/** Linux: no strip, as the system frame's title bar is above the page. */
export const Linux: Story = {
  args: NoWorkspace.args,
  decorators: [
    (Story) => (
      <WindowFrameProvider value={{ platform: 'linux', controls: 'drawn' }}>
        <Story />
      </WindowFrameProvider>
    ),
  ],
};
