import type { Meta, StoryObj } from '@storybook/react-vite';
import { Circle, FileText } from 'lucide-react';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { ConfirmDialog, ConfirmDialogChoices, ConfirmDialogItems } from './ConfirmDialog';

const meta = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    defaultOpen: true,
    trigger: <Button variant="destructive">Delete permanently</Button>,
    title: 'Delete task permanently?',
    description:
      '“Implement OAuth2 PKCE flow” and its 4 subtasks will be removed from the trash for good. Its task note is kept.',
    irreversible: true,
    actionLabel: 'Delete Task',
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 480, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeleteTask: Story = {};

export const DeleteProject: Story = {
  args: {
    title: 'Delete project permanently?',
    description:
      '“Auth Overhaul” will be removed from the trash for good. Its 12 tasks and 3 notes are kept and no longer belong to a project.',
    actionLabel: 'Delete Project',
  },
};

export const DeleteNote: Story = {
  args: {
    title: 'Delete note permanently?',
    description:
      '“Sprint 14 retro” will be removed from the trash for good, along with its links to tasks and events.',
    actionLabel: 'Delete Note',
  },
};

/** Disconnecting an integration asks what happens to the items it synced. */
export const Disconnect: Story = {
  args: {
    trigger: <Button>Disconnect</Button>,
    title: 'Disconnect Linear?',
    description:
      'DevBrain stops syncing Mitchell George · Acme and removes its API key from this Mac.',
    irreversible: false,
    actionLabel: 'Disconnect',
    children: (
      <ConfirmDialogChoices
        label="Synced items"
        defaultValue="keep"
        choices={[
          {
            value: 'keep',
            label: 'Keep as local copies',
            description:
              '8 tasks and 2 projects stay in DevBrain as your own. They stop syncing and become editable.',
          },
          {
            value: 'remove',
            label: 'Remove them',
            description:
              'Deletes 6 tasks and 1 project. 2 tasks and 1 project stay as local copies because a note or event links to them.',
          },
        ]}
      />
    ),
  },
};

/** The action enables once the workspace's name is typed. */
export const DeleteWorkspace: Story = {
  args: {
    title: 'Delete workspace?',
    description:
      'Everything in SurveyMonkey is deleted from this Mac: its tasks, projects, notes, calendars and connected accounts.',
    actionLabel: 'Delete Workspace',
    confirmText: 'SurveyMonkey',
  },
};

/** Moving tasks to the trash lists what goes with them: their subtasks and linked notes. */
export const MoveToTrash: Story = {
  args: {
    trigger: <Button variant="destructive">Move to Trash</Button>,
    title: 'Move 3 tasks to trash?',
    description: 'You can restore them from Trash.',
    irreversible: false,
    actionLabel: 'Move to Trash',
    children: (
      <ConfirmDialogItems
        label="Also moves 6 subtasks and 2 notes"
        max={6}
        items={[
          ...[
            'Add PKCE verifier',
            'Rotate refresh tokens',
            'Handle consent screen errors',
            'Write migration for token table',
          ].map((title) => ({ key: title, icon: <Icon icon={Circle} size={16} />, label: title })),
          ...['OAuth2 PKCE design', 'Token storage notes'].map((title) => ({
            key: title,
            icon: <Icon icon={FileText} size={16} />,
            label: title,
          })),
          ...['Update the sign-in docs', 'Remove legacy flow'].map((title) => ({
            key: title,
            icon: <Icon icon={Circle} size={16} />,
            label: title,
          })),
        ]}
      />
    ),
  },
};
