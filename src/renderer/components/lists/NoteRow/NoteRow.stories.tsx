import type { Meta, StoryObj } from '@storybook/react-vite';
import { PKCE_NOTE, SAMPLE_NOTES } from '../../notes/NoteCard/fixtures';
import { NoteRow } from './NoteRow';

const meta = {
  title: 'Lists/NoteRow',
  component: NoteRow,
  args: { note: PKCE_NOTE, onSelect: () => {} },
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

/** A task's note: its preview, the task and project pills, and when it was edited. */
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

/** Notes edited at different times, linked to an event, a project, or nothing. */
export const List: Story = {
  render: () => (
    <div>
      {SAMPLE_NOTES.map((note) => (
        <NoteRow key={note.title} note={note} onSelect={() => {}} />
      ))}
    </div>
  ),
};
