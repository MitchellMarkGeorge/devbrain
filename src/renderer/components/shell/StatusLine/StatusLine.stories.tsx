import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusLine } from './StatusLine';

const meta = {
  title: 'Shell/StatusLine',
  component: StatusLine,
  args: {
    mode: 'normal',
    context: 'Tasks › List · 3/8',
    hints: [
      { keys: '?', label: 'keys' },
      { keys: ':', label: 'command' },
      { keys: 'f', label: 'hints' },
    ],
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ paddingTop: 260, containerType: 'inline-size' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusLine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {};

/** Figma `7702:55408`: one line per mode. */
export const Modes: Story = {
  render: (args) => (
    <div style={{ display: 'grid', gap: 16 }}>
      {(['normal', 'insert', 'visual', 'hint', 'command'] as const).map((mode) => (
        <StatusLine key={mode} {...args} mode={mode} />
      ))}
    </div>
  ),
};

/** `3d`: a count and the start of `dd`. */
export const Pending: Story = { args: { pending: '3d' } };

export const Visual: Story = {
  args: {
    mode: 'visual',
    context: 'Tasks › List · 4/8 · rows 2–4',
    hints: [
      { keys: 'x', label: 'select' },
      { keys: 's', label: 'status' },
      { keys: 'dd', label: 'trash' },
      { keys: 'Esc', label: 'cancel' },
    ],
  },
};

/** The editor's Visual line mode names itself. */
export const VisualLine: Story = {
  args: { mode: 'visual', label: 'VISUAL LINE', context: 'Notes › Auth provider · 3 lines' },
};

/** After `g`: what can follow, above the line (Figma `7703:55909`). */
export const WithPopup: Story = {
  args: {
    pending: 'g',
    popup: (
      <div style={{ display: 'grid', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <span>g …</span>
        <span>g First item</span>
        <span>h Home</span>
        <span>t Tasks</span>
      </div>
    ),
  },
};

/** The `:` line: an input in place of the context. */
export const Command: Story = {
  args: {
    mode: 'command',
    hints: [
      { keys: 'Tab', label: 'next' },
      { keys: '↵', label: 'run' },
      { keys: 'Esc', label: 'cancel' },
    ],
    children: <span style={{ color: 'var(--foreground)' }}>:sort p</span>,
  },
};
