import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DraftTaskList, DraftTaskRow } from './DraftTaskRow';

const meta = {
  title: 'Lists/DraftTaskRow',
  component: DraftTaskRow,
  args: { title: 'Task title', onRemove: () => {} },
  decorators: [
    (Story) => (
      <div style={{ width: 568 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DraftTaskRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The subtasks typed into the new-task dialog. */
export const Subtasks: Story = {
  render: () => (
    <div>
      <DraftTaskRow title="Generate the code verifier and challenge" />
      <DraftTaskRow title="Exchange the code for tokens" />
      <DraftTaskRow title="Store the refresh token in the keychain" />
    </div>
  ),
};

export const Hover: Story = { args: { state: 'hover' } };

/** A new task's subtasks: the label and count, the rows, then the field for the next one */
export const List: Story = {
  render: function Render() {
    const [tasks, setTasks] = useState([
      'Register a passkey on the account page',
      'Verify the passkey assertion at sign-in',
    ]);
    return (
      <DraftTaskList
        label="Subtasks"
        count={tasks.length}
        placeholder="Add a subtask…"
        onAdd={(title) => setTasks((t) => [...t, title])}
      >
        {tasks.map((title) => (
          <DraftTaskRow
            key={title}
            title={title}
            onRemove={() => setTasks((t) => t.filter((x) => x !== title))}
          />
        ))}
      </DraftTaskList>
    );
  },
};
