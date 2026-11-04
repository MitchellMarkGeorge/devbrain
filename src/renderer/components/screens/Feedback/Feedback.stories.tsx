import { useEffect, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ConfirmDialog, ConfirmDialogChoices } from '../../ui/ConfirmDialog';
import { toast, toastManager, ToastProvider, type ToastOptions } from '../../ui/Toast';
import { AppFrame, PageHeader, Spacer } from '../Calendar/AppFrame';
import { TasksPage } from '../Menus/TasksPage';
import { Trash } from '../Trash/Trash.stories';

const meta = {
  title: 'Screens/Feedback',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The 1440 × 1024 window the screens are drawn in; dialogs centre on it. */
function ScreenWindow({ children }: { children: ReactNode }) {
  return <div style={{ position: 'relative', width: 1440, height: 1024 }}>{children}</div>;
}

/** Shows toasts, oldest first, once the provider listens; closes them on unmount. */
function ShowToasts({ toasts }: { toasts: ToastOptions[] }) {
  useEffect(() => {
    const ids: string[] = [];
    const timer = setTimeout(() => {
      for (const options of toasts) ids.push(toast({ timeout: 0, ...options }));
    });
    return () => {
      clearTimeout(timer);
      ids.forEach((id) => toastManager.close(id));
    };
  }, [toasts]);
  return null;
}

const renderTrash = Trash.render as () => ReactNode;

/** Figma "Trash — delete permanently confirm" (7285:53046). */
export const TrashDeleteConfirm: Story = {
  name: 'Trash — delete permanently confirm',
  render: () => (
    <ScreenWindow>
      {renderTrash()}
      <ConfirmDialog
        defaultOpen
        title="Delete note permanently?"
        description="“Sprint 14 retro” will be removed from the trash for good, along with its links to tasks and events."
        irreversible
        actionLabel="Delete Note"
      />
    </ScreenWindow>
  ),
};

/**
 * Figma "Integrations — disconnect confirm" (7175:34304), over a bare Integrations page (the
 * Integrations screen is another area's).
 */
export const DisconnectConfirm: Story = {
  name: 'Integrations — disconnect confirm',
  render: () => (
    <ScreenWindow>
      <AppFrame page="Integrations">
        <PageHeader title="Integrations">
          <Spacer />
          <Button icon={Plus}>Connect Account</Button>
        </PageHeader>
      </AppFrame>
      <ConfirmDialog
        defaultOpen
        title="Disconnect Linear?"
        description="DevBrain stops syncing Mitchell George · Acme and removes its API key from this Mac."
        actionLabel="Disconnect"
      >
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
      </ConfirmDialog>
    </ScreenWindow>
  ),
};

const MOVED: ToastOptions[] = [
  { title: 'Task moved to trash', action: { label: 'Undo', onClick: () => undefined } },
];

/** Figma "Tasks (list) — moved to trash toast" (7175:33810). */
export const MovedToTrashToast: Story = {
  name: 'Tasks (list) — moved to trash toast',
  render: () => (
    <ToastProvider>
      <TasksPage />
      <ShowToasts toasts={MOVED} />
    </ToastProvider>
  ),
};

const STACK: ToastOptions[] = [
  {
    tone: 'success',
    title: 'Linear connected',
    description: 'Syncing the issues assigned to you…',
  },
  {
    tone: 'error',
    title: 'Couldn’t sync Google Calendar',
    description: 'Google didn’t respond. Events are as of 8:30 AM.',
    action: { label: 'Retry', onClick: () => undefined },
  },
  {
    title: 'Moved to trash',
    description: 'Implement OAuth2 PKCE flow, its 4 subtasks and its task note',
    action: { label: 'Undo', onClick: () => undefined },
  },
];

/**
 * Figma's "Toast stack (example)" (7175:20586): the newest toast in front, the two before it
 * peeking 10px above it, each 20px narrower. Point at the stack to spread it 8px apart.
 */
export const ToastStack: Story = {
  render: () => (
    <ToastProvider>
      <TasksPage />
      <ShowToasts toasts={STACK} />
    </ToastProvider>
  ),
};
