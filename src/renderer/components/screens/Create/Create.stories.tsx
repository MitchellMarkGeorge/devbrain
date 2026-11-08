import { useState } from 'react';
import { TaskPriority, TaskStatus } from '@common/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRight, Calendar, Clock, FileText, MapPin, Plus, Repeat, Video } from 'lucide-react';
import { Button } from '../../ui/Button';
import {
  CreateDialogBody,
  CreateDialogContent,
  CreateDialogDescriptionInput,
  CreateDialogField,
  CreateDialogFieldList,
  CreateDialogFields,
  CreateDialogFooter,
  CreateDialogProperties,
  CreateDialogTitleInput,
} from '../../detail/CreateDialog';
import { Dialog, DialogClose } from '../../ui/Dialog';
import { DraftTaskList, DraftTaskRow } from '../../lists/DraftTaskRow';
import { EntityPill } from '../../entities/EntityPill';
import { Icon } from '../../ui/Icon';
import { Input } from '../../ui/Input';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { StatusIcon } from '../../entities/StatusIcon';
import { Switch } from '../../ui/Switch';
import { TaskList } from '../../lists/TaskList';
import { Textarea } from '../../ui/Textarea';
import { AppWindow, DetailTopBar } from '../TaskDetail/frame';
import {
  sampleEventLink,
  sampleLinear,
  sampleNoteLink,
  sampleProject,
  sampleTask,
} from '../../lists/TaskRow/fixtures';
import { storyDate } from '../../lib/story-dates';

const meta = {
  title: 'Screens/Create',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The tasks list behind the dialog */
function TasksPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      <DetailTopBar items={[{ label: 'Tasks', href: '#' }, 'List']} actions={false} />
      <div style={{ padding: '8px 16px' }}>
        <TaskList
          selectionBar={false}
          tasks={[
            sampleTask({
              title: 'Implement OAuth2 PKCE flow',
              status: TaskStatus.IN_PROGRESS,
              priority: TaskPriority.HIGH,
              dueDate: storyDate(2),
              external: sampleLinear('ENG-124'),
              subtaskProgress: { completed: 3, total: 4 },
              project: sampleProject('Auth Overhaul', 'blue'),
              link: sampleEventLink('Mitchell / Jesse 1:1'),
            }),
            sampleTask({
              title: 'Refactor token refresh logic',
              status: TaskStatus.IN_PROGRESS,
              priority: TaskPriority.HIGH,
              dueDate: storyDate(-4),
              project: sampleProject('Auth Overhaul', 'blue'),
            }),
            sampleTask({
              title: 'Audit token storage',
              priority: TaskPriority.HIGH,
              dueDate: storyDate(-3),
              external: sampleLinear('ENG-118'),
              project: sampleProject('Auth Overhaul', 'blue'),
            }),
            sampleTask({
              title: 'Write PKCE migration guide',
              priority: TaskPriority.MEDIUM,
              dueDate: storyDate(0),
              project: sampleProject('Auth Overhaul', 'blue'),
              link: sampleNoteLink('PKCE design notes'),
            }),
            sampleTask({
              title: 'Integrate database connection',
              priority: TaskPriority.MEDIUM,
              dueDate: storyDate(4),
              external: sampleLinear('ENG-140'),
              project: sampleProject('API Gateway v2', 'amber'),
            }),
            sampleTask({
              title: 'Create user interface mockups',
              dueDate: storyDate(8),
              subtaskProgress: { completed: 1, total: 4 },
              project: sampleProject('User Interface Revamp', 'indigo'),
            }),
            sampleTask({
              title: 'Set up API Gateway',
              status: TaskStatus.COMPLETED,
              priority: TaskPriority.MEDIUM,
              dueDate: storyDate(-7),
              external: sampleLinear('ENG-102'),
              project: sampleProject('API Gateway v2', 'amber'),
            }),
          ]}
        />
      </div>
    </div>
  );
}

function Footer({ action, createMore }: { action: string; createMore?: boolean }) {
  const [more, setMore] = useState(false);
  return (
    <CreateDialogFooter createMore={createMore ? more : undefined} onCreateMoreChange={setMore}>
      <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
      <Button>{action}</Button>
    </CreateDialogFooter>
  );
}

/** Create task (7175:39512): the empty dialog over the tasks list */
export const CreateTask: Story = {
  name: 'Create task',
  render: () => (
    <AppWindow active="Tasks">
      <TasksPage />
      <Dialog defaultOpen>
        <CreateDialogContent aria-label="New task">
          <CreateDialogBody>
            <CreateDialogFields>
              <CreateDialogTitleInput placeholder="Task title" aria-label="Title" />
              <CreateDialogDescriptionInput
                placeholder="Add description…"
                aria-label="Description"
              />
            </CreateDialogFields>
            <CreateDialogProperties onMore={() => undefined}>
              <EntityPill glyph={<StatusIcon status={TaskStatus.NOT_STARTED} size={12} />}>
                Not started
              </EntityPill>
              <EntityPill glyph={<PriorityIcon priority={TaskPriority.LOW} size={12} />}>
                Low
              </EntityPill>
              <EntityPill glyph={Calendar}>Due date</EntityPill>
              <EntityPill glyph={Plus}>Project</EntityPill>
              <EntityPill glyph={Plus}>Link to event or note</EntityPill>
            </CreateDialogProperties>
          </CreateDialogBody>
          <Footer action="Create Task" createMore />
        </CreateDialogContent>
      </Dialog>
    </AppWindow>
  ),
};

/** CreateTaskDialog state=with subtasks: subtasks typed before the task exists */
export const CreateTaskWithSubtasks: Story = {
  name: 'Create task – with subtasks',
  render: function Render() {
    const [subtasks, setSubtasks] = useState([
      'Register a passkey on the account page',
      'Verify the passkey assertion at sign-in',
    ]);
    return (
      <AppWindow active="Tasks">
        <TasksPage />
        <Dialog defaultOpen>
          <CreateDialogContent aria-label="New task">
            <CreateDialogBody>
              <CreateDialogFields>
                <CreateDialogTitleInput defaultValue="Add passkey sign-in" aria-label="Title" />
                <CreateDialogDescriptionInput
                  defaultValue="Offer passkeys next to the password on web and mobile; PKCE stays the OAuth flow."
                  aria-label="Description"
                />
              </CreateDialogFields>
              <CreateDialogProperties onMore={() => undefined}>
                <EntityPill glyph={<StatusIcon status={TaskStatus.NOT_STARTED} size={12} />}>
                  Not started
                </EntityPill>
                <EntityPill glyph={<PriorityIcon priority={TaskPriority.HIGH} size={12} />}>
                  High
                </EntityPill>
                <EntityPill glyph={Calendar}>Jun 26</EntityPill>
                <EntityPill entity={{ type: 'project', title: 'Auth Overhaul', color: 'blue' }} />
                <EntityPill glyph={Plus}>Link to event or note</EntityPill>
              </CreateDialogProperties>
              <DraftTaskList
                label="Subtasks"
                count={subtasks.length}
                placeholder="Add a subtask…"
                onAdd={(title) => setSubtasks((s) => [...s, title])}
              >
                {subtasks.map((title) => (
                  <DraftTaskRow
                    key={title}
                    title={title}
                    onRemove={() => setSubtasks((s) => s.filter((t) => t !== title))}
                  />
                ))}
              </DraftTaskList>
            </CreateDialogBody>
            <Footer action="Create Task" createMore />
          </CreateDialogContent>
        </Dialog>
      </AppWindow>
    );
  },
};

/** Create event (7175:42495): the 480px event dialog, filled */
export const CreateEvent: Story = {
  name: 'Create event',
  render: () => (
    <AppWindow active="Calendar">
      <div style={{ flex: 1 }} />
      <Dialog defaultOpen>
        <CreateDialogContent size="event" aria-label="New event">
          <CreateDialogBody>
            <CreateDialogTitleInput defaultValue="PKCE rollout sync" aria-label="Title" />
            <CreateDialogFieldList>
              <CreateDialogField icon={Clock} label="When">
                <EntityPill>Mon, Jun 22</EntityPill>
                <EntityPill>1:00 PM</EntityPill>
                <Icon icon={ArrowRight} size={12} style={{ color: 'var(--muted-foreground)' }} />
                <EntityPill>2:00 PM</EntityPill>
                <span style={{ marginLeft: 'auto' }}>
                  <Switch>All day</Switch>
                </span>
              </CreateDialogField>
              <CreateDialogField icon={Repeat} label="Repeat">
                <EntityPill>Every weekday</EntityPill>
              </CreateDialogField>
              <CreateDialogField icon={Calendar} label="Calendar">
                <EntityPill entity={{ type: 'event', title: 'Work', color: 'blue' }} />
              </CreateDialogField>
              <CreateDialogField icon={MapPin} label="Location">
                <Input defaultValue="Room 4B" placeholder="Add location" aria-label="Location" />
              </CreateDialogField>
              <CreateDialogField icon={Video} label="Meeting link">
                <Input
                  defaultValue="meet.example.com/pkce-sync"
                  placeholder="Add meeting link"
                  aria-label="Meeting link"
                />
              </CreateDialogField>
              <CreateDialogField icon={FileText} label="Description">
                <Textarea
                  defaultValue="Daily check-in while the PKCE flag rolls out to mobile."
                  placeholder="Add description…"
                  aria-label="Description"
                />
              </CreateDialogField>
            </CreateDialogFieldList>
          </CreateDialogBody>
          <Footer action="Create Event" />
        </CreateDialogContent>
      </Dialog>
    </AppWindow>
  ),
};
