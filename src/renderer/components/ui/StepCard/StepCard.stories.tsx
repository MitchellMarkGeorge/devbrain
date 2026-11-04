import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronDown, SquarePen } from 'lucide-react';
import { Button } from '../Button';
import { Kbd } from '../Kbd';
import { ProviderTile } from '../ProviderTile';
import { QuickAddInput } from '../QuickAddInput';
import { StepCard } from './StepCard';

const meta = {
  title: 'Home/First run/StepCard',
  component: StepCard,
  decorators: [
    (Story) => (
      <div style={{ width: 349 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StepCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const providers = (
  <div style={{ display: 'flex', gap: 8 }}>
    <ProviderTile provider="linear" />
    <ProviderTile provider="google-calendar" />
    <ProviderTile provider="github" />
  </div>
);

export const BringInYourWork: Story = {
  args: {
    step: 1,
    title: 'Bring in your work',
    description: 'Linear issues and today’s meetings, kept in sync.',
    preview: providers,
    footer: (
      <>
        <Button size="sm" trailingIcon={ChevronDown}>
          Connect
        </Button>
        <span style={{ marginLeft: 'auto' }}>About a minute</span>
      </>
    ),
  },
};

export const CaptureATask: Story = {
  args: {
    step: 2,
    title: 'Capture a task',
    description: 'Type what’s on your plate. It lands in Tasks, due today.',
    preview: <QuickAddInput placeholder="What’s on today?" />,
    footer: (
      <>
        <Kbd>↵</Kbd> to add it
      </>
    ),
  },
};

export const WriteItDown: Story = {
  args: {
    step: 3,
    title: 'Write it down',
    description: 'Notes are Markdown files in your workspace folder.',
    footer: (
      <Button size="sm" icon={SquarePen}>
        New Note
      </Button>
    ),
  },
};

/** Done: the green check, a muted title and what was done. */
export const Done: Story = {
  args: {
    step: 2,
    done: true,
    title: 'Capture a task',
    description: 'Type what’s on your plate. It lands in Tasks, due today.',
    preview: <QuickAddInput placeholder="Add another task…" />,
    doneText: '1 task added',
  },
};
