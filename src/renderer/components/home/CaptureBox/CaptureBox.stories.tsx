import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar, Flag, Folder } from 'lucide-react';
import { CaptureBox, CaptureBoxPicker } from './CaptureBox';

const meta = {
  title: 'Home/CaptureBox',
  component: CaptureBox,
  args: {
    tip: 'Type “tomorrow” or “#Auth Overhaul” and the details fill in. Press Enter to add.',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 800 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CaptureBox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty, as Home opens: Task chosen, and its project, due date and priority pickers. */
export const Default: Story = {};

/** Recognised words are marked and fill their pickers. */
export const Recognised: Story = {
  args: {
    defaultValue: 'Write the PKCE migration guide tomorrow #Auth Overhaul',
    highlights: ['tomorrow', '#Auth Overhaul'],
    pickers: (
      <>
        <CaptureBoxPicker icon={Folder}>Auth Overhaul</CaptureBoxPicker>
        <CaptureBoxPicker icon={Calendar}>Tomorrow</CaptureBoxPicker>
        <CaptureBoxPicker icon={Flag}>Priority</CaptureBoxPicker>
      </>
    ),
  },
};

/** Event: calendar, time and length, and "Add event". */
export const Event: Story = { args: { defaultKind: 'event' } };

/** Note: only the project. */
export const Note: Story = { args: { defaultKind: 'note' } };

/** A new workspace's tip. */
export const FirstRun: Story = {
  args: { tip: 'Try “Draft Q3 roadmap tomorrow”. Press Enter to add it.' },
};
