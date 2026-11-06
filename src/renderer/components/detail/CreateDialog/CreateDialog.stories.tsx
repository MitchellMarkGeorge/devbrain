import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority, TaskStatus } from '@common/types';
import { Calendar, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Dialog, DialogClose, DialogTrigger } from '../../ui/Dialog';
import { EntityPill } from '../../entities/EntityPill';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { StatusIcon } from '../../entities/StatusIcon';
import { TooltipProvider } from '../../ui/Tooltip';
import {
  CreateDialogBody,
  CreateDialogContent,
  CreateDialogDescriptionInput,
  CreateDialogFields,
  CreateDialogFooter,
  CreateDialogProperties,
  CreateDialogTitleInput,
} from './CreateDialog';

const meta = {
  title: 'Detail/CreateDialog',
  component: CreateDialogContent,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div style={{ height: 520, padding: 24 }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof CreateDialogContent>;

export default meta;
type Story = StoryObj<typeof meta>;

function NewTask({ open, subtask }: { open?: boolean; subtask?: boolean }) {
  return (
    <Dialog defaultOpen={open}>
      <DialogTrigger render={<Button icon={Plus} />}>New Task</DialogTrigger>
      <CreateDialogContent aria-label={subtask ? 'New subtask' : 'New task'}>
        <CreateDialogBody>
          {subtask && (
            <EntityPill
              entity={{
                type: 'task',
                title: 'Implement OAuth2 PKCE flow',
                status: TaskStatus.IN_PROGRESS,
              }}
              prefix="Subtask of"
              style={{ alignSelf: 'flex-start' }}
            />
          )}
          <CreateDialogFields>
            <CreateDialogTitleInput
              placeholder={subtask ? 'Subtask title' : 'Task title'}
              aria-label="Title"
            />
            <CreateDialogDescriptionInput placeholder="Add description…" aria-label="Description" />
          </CreateDialogFields>
          <CreateDialogProperties onMore={() => undefined}>
            <EntityPill glyph={<StatusIcon status={TaskStatus.NOT_STARTED} size={12} />}>
              Not started
            </EntityPill>
            <EntityPill glyph={<PriorityIcon priority={TaskPriority.LOW} size={12} />}>
              Low
            </EntityPill>
            <EntityPill glyph={Calendar}>Due date</EntityPill>
            {!subtask && (
              <>
                <EntityPill glyph={Plus}>Project</EntityPill>
                <EntityPill glyph={Plus}>Link to event or note</EntityPill>
              </>
            )}
          </CreateDialogProperties>
        </CreateDialogBody>
        <CreateDialogFooter createMore={false}>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button disabled>{subtask ? 'Create Subtask' : 'Create Task'}</Button>
        </CreateDialogFooter>
      </CreateDialogContent>
    </Dialog>
  );
}

/** state=empty: Create stays disabled until the due date is set */
export const Empty: Story = { render: () => <NewTask open /> };

/** state=subtask: opened from a task's Subtasks "Add"; the parent's project and link carry over */
export const Subtask: Story = { render: () => <NewTask open subtask /> };

export const Closed: Story = { render: () => <NewTask /> };
