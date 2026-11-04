import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, Folder, Plus, SquarePen } from 'lucide-react';
import { Stack } from '../../layout/Flex';
import { Button } from '../Button';
import { ProviderTile } from '../ProviderTile';
import { QuickAddInput } from '../QuickAddInput';
import { SetupPrompt } from './SetupPrompt';

const meta = {
  title: 'Home/First run/SetupPrompt',
  component: SetupPrompt,
} satisfies Meta<typeof SetupPrompt>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma's four kinds: calendar, task, note and project. */
export const Kinds: Story = {
  render: () => (
    <Stack gap="6" align="start">
      <SetupPrompt
        icon={<ProviderTile provider="google-calendar" />}
        title="See today’s meetings here"
        description="From Google Calendar, kept in sync."
      >
        <Button size="sm">Connect Google Calendar</Button>
        <Button size="sm" variant="ghost">
          Skip
        </Button>
      </SetupPrompt>
      <SetupPrompt>
        <QuickAddInput surface="popover" style={{ width: 360 }} />
        or
        <Button size="sm" variant="ghost" icon={<ProviderTile provider="linear" size={16} />}>
          Connect Linear
        </Button>
      </SetupPrompt>
      <SetupPrompt
        icon={FileText}
        title="Write your first note"
        description="Notes are Markdown files in your workspace folder."
      >
        <Button size="sm" icon={SquarePen}>
          New Note
        </Button>
      </SetupPrompt>
      <SetupPrompt
        icon={Folder}
        title="Start a project"
        description="Group tasks and notes, and see how they’re going."
      >
        <Button size="sm" icon={Plus}>
          New Project
        </Button>
      </SetupPrompt>
    </Stack>
  ),
};
