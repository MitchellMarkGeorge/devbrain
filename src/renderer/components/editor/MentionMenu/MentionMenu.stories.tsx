import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskStatus } from '@common/types';
import { MentionMenu } from './MentionMenu';

const meta = {
  title: 'Editor/MentionMenu',
  component: MentionMenu,
  args: {
    groups: [
      {
        label: 'Tasks',
        items: [
          {
            kind: 'task',
            id: '124',
            title: 'Implement OAuth2 PKCE flow',
            status: TaskStatus.IN_PROGRESS,
            meta: 'Jun 24',
          },
          {
            kind: 'task',
            id: '201',
            title: 'Write PKCE migration guide',
            status: TaskStatus.NOT_STARTED,
            meta: 'Today',
          },
        ],
      },
      {
        label: 'Notes',
        items: [
          { kind: 'note', id: 'n1', title: 'PKCE design notes', meta: '2h ago' },
          { kind: 'note', id: 'n2', title: 'Architecture ADR #4 — PKCE', meta: 'Yesterday' },
        ],
      },
      {
        label: 'Events',
        items: [
          {
            kind: 'event',
            id: 'e1',
            title: 'Mitchell / Jesse 1:1',
            color: 'green',
            meta: '10:30 AM',
          },
          {
            kind: 'event',
            id: 'e2',
            title: 'Auth Overhaul Design Review',
            color: 'blue',
            meta: 'Tue',
          },
        ],
      },
    ],
  },
} satisfies Meta<typeof MentionMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "@pkce": tasks, notes and events that match */
export const Default: Story = {};
