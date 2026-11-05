import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleHelp, Folder, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Logomark } from '../../ui/Logomark';
import { OnboardingScreen } from './OnboardingScreen';

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
    trafficLights: 'drawn',
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
  args: { trafficLights: 'drawn', logo: <Logomark size="lg" pulse /> },
};
