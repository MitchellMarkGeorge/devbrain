import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ProviderTile } from '../../entities/ProviderTile';
import { HomeSection } from '../HomeSection';
import { SetupRow } from './SetupRow';

const meta = {
  title: 'Home/SetupRow',
  component: SetupRow,
  args: {
    icon: <ProviderTile provider="google-calendar" />,
    title: 'Connect Google Calendar',
    description: 'Your meetings show up here, and move to the top just before they start.',
    action: <Button size="sm">Connect</Button>,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 800 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SetupRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Provider: Story = {};

/** A step inside the app: its icon in a `secondary` tile. */
export const InApp: Story = {
  args: {
    icon: Folder,
    title: 'Start a project',
    description: 'Group tasks and notes toward a goal, and see its progress here.',
    action: <Button size="sm">Create</Button>,
  },
};

/** "Get started" in a new workspace: no header link; rows go once their step is done. */
export const GetStarted: Story = {
  render: () => (
    <HomeSection title="Get started">
      <SetupRow
        icon={<ProviderTile provider="google-calendar" />}
        title="Connect Google Calendar"
        description="Your meetings show up here, and move to the top just before they start."
        action={<Button size="sm">Connect</Button>}
      />
      <SetupRow
        icon={<ProviderTile provider="linear" />}
        title="Connect Linear"
        description="Issues assigned to you show up as tasks, and stay in sync."
        action={<Button size="sm">Connect</Button>}
      />
      <SetupRow
        icon={Folder}
        title="Start a project"
        description="Group tasks and notes toward a goal, and see its progress here."
        action={<Button size="sm">Create</Button>}
      />
    </HomeSection>
  ),
};
