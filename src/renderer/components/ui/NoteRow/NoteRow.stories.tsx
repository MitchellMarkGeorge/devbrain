import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityPill } from '../EntityPill';
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
