import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityPill } from '../../entities/EntityPill';
import { NoteRow } from './NoteRow';

const meta = {
  title: 'Lists/NoteRow',
  component: NoteRow,
  args: {
    title: 'PKCE design notes',
    excerpt: 'S256 challenge, 96-char verifier, 10-minute code TTL.',
    edited: '2h ago',
    onSelect: () => {},
    children: (
      <>
        <EntityPill type="task">Write PKCE migration guide</EntityPill>
        <EntityPill type="project" color="blue">
          Auth Overhaul
        </EntityPill>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 1152 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NoteRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Hover: Story = { args: { state: 'hover' } };
export const Selected: Story = { args: { selected: true } };
/** A long excerpt shortens first; the title and pills keep their width. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
};

/** Home's Recent notes (as its second section): what the note belongs to as quiet text, no excerpt. */
export const Home: Story = {
  args: { excerpt: undefined, onSelect: undefined, children: undefined },
  render: (args) => (
    <div style={{ width: 800 }}>
      <NoteRow {...args} context="Auth Overhaul" edited="6 min ago" />
      <NoteRow {...args} title="Mitchell / Jesse 1:1" context="Meeting note" edited="40 min ago" />
      <NoteRow {...args} title="Sprint 15 planning" context="Sprint Planning" edited="2h ago" />
    </div>
  ),
};
