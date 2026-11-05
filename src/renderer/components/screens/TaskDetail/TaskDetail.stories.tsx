import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar, Plus } from 'lucide-react';
import { Heading } from '../../layout/Heading';
import { AddSlot } from '../../detail/AddSlot';
import { Button } from '../../ui/Button';
import { DateRange } from '../../detail/DateRange';
import { DetailSection } from '../../detail/DetailSection';
import { DocumentPage } from '../../shell/DocumentPage';
import { EntityPill } from '../../entities/EntityPill';
import { PriorityIcon } from '../../entities/PriorityIcon';
import { ProgressRing } from '../../ui/ProgressRing';
import { PropertyRow, TASK_ADD_ITEMS } from '../../detail/PropertyRow';
import { StatusIcon } from '../../entities/StatusIcon';
import { SyncedBadge } from '../../entities/SyncedBadge';
import { TaskList } from '../../lists/TaskList';
import { TaskNoteCard } from '../../detail/TaskNoteCard';
import type { Task } from '../../lists/TaskRow/types';
import { AppWindow, DetailTopBar } from './frame';
import { PKCE_DESCRIPTION, PKCE_SUBTASKS } from './data';

const meta = {
  title: 'Screens/TaskDetail',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Description({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontSize: 14,
        lineHeight: '20px',
      }}
    >
      {paragraphs.map((p) => (
        <p key={p} style={{ margin: 0 }}>
          {p}
        </p>
      ))}
    </div>
  );
}

interface TaskPageProps {
  title: string;
  status: Parameters<typeof StatusIcon>[0]['status'];
  properties: React.ReactNode;
  links?: React.ReactNode;
  note?: string;
  addable?: boolean;
  description: string[];
  subtasks: Task[];
  done: number;
  canAdd?: boolean;
  taskNote?: React.ReactNode;
}

function TaskPage({
  title,
  status,
  properties,
  links,
  note,
  addable = true,
  description,
  subtasks,
  done,
  canAdd = true,
  taskNote,
}: TaskPageProps) {
  return (
    <AppWindow active="Tasks">
      <DocumentPage
        style={{ flex: 1 }}
        header={
          <DetailTopBar
            items={[
              { label: 'Tasks', href: '#' },
              { label: title, icon: <StatusIcon status={status} /> },
            ]}
          />
        }
        columnClassName="task-page"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <Heading level={1} variant="document">
            {title}
          </Heading>
          <PropertyRow
            properties={properties}
            links={links}
            note={note}
            addable={addable}
            addItems={TASK_ADD_ITEMS.filter(
              (i) => i.key === 'parent' || i.key === 'event' || i.key === 'pull-request',
            )}
          />
          <Description paragraphs={description} />
          <DetailSection
            spacing="page"
            title="Subtasks"
            glyph={<ProgressRing value={done} total={subtasks.length} size={12} />}
            count={`${done}/${subtasks.length}`}
            action={
              canAdd && (
                <Button size="xs" icon={Plus}>
                  Add
                </Button>
              )
            }
          >
            {/* the rows' selection strip hangs into the page margin, so the status icons line up
                12px in from the column like the Figma page */}
            <TaskList tasks={subtasks} selectionBar={false} style={{ marginLeft: -36 }} />
          </DetailSection>
          <DetailSection spacing="page" title="Task note">
            {taskNote}
          </DetailSection>
        </div>
      </DocumentPage>
    </AppWindow>
  );
}

/** Task detail (7158:6266): a local task with dates, project, subtasks and its note */
export const TaskDetail: Story = {
  render: () => (
    <TaskPage
      title="Implement OAuth2 PKCE flow"
      status="in-progress"
      properties={
        <>
          <EntityPill glyph={<StatusIcon status="in-progress" size={12} />}>In progress</EntityPill>
          <EntityPill glyph={<PriorityIcon priority="high" size={12} />}>High</EntityPill>
          <DateRange start="Jun 15" due="Jun 24" />
          <EntityPill type="project" color="blue">
            Auth Overhaul
          </EntityPill>
        </>
      }
      description={PKCE_DESCRIPTION}
      subtasks={PKCE_SUBTASKS}
      done={3}
      taskNote={
        <TaskNoteCard
          title="Implement OAuth2 PKCE flow"
          project="Auth Overhaul"
          projectColor="blue"
          tasksSummary="2 tasks · 1 in progress"
          updated="2h ago"
        />
      }
    />
  ),
};

/** Task detail (subtask) (7158:7794): the parent pill on the links line, no note yet */
export const TaskDetailSubtask: Story = {
  name: 'Task detail (subtask)',
  render: () => (
    <TaskPage
      title="Mobile fallback"
      status="in-progress"
      properties={
        <>
          <EntityPill glyph={<StatusIcon status="not-started" size={12} />}>Not started</EntityPill>
          <EntityPill glyph={<PriorityIcon priority="high" size={12} />}>High</EntityPill>
          <DateRange start="Jun 15" due="Jun 24" />
          <EntityPill type="project" color="blue">
            Auth Overhaul
          </EntityPill>
        </>
      }
      links={
        <EntityPill type="parent" status="in-progress">
          Implement OAuth2 PKCE flow
        </EntityPill>
      }
      description={[
        'Some in-app browsers block the custom-scheme redirect that PKCE relies on. Detect them and hand sign-in to the system browser so it still completes.',
        'The fallback reuses the same code verifier and S256 challenge, so the token exchange endpoint needs no changes.',
      ]}
      subtasks={[
        {
          id: 'eng-129',
          title: 'Detect in-app browsers',
          status: 'completed',
          key: 'ENG-129',
          priority: 'medium',
          date: 'Jun 19',
        },
        {
          id: 'eng-130',
          title: 'System browser handoff',
          status: 'not-started',
          key: 'ENG-130',
          priority: 'high',
          date: 'Jun 24',
        },
      ]}
      done={1}
      taskNote={<AddSlot size="lg">Add a task note</AddSlot>}
    />
  ),
};

/** Task detail – synced from Linear (7175:32210): Linear's values, no "+ Add", a sync note */
export const TaskDetailSynced: Story = {
  name: 'Task detail – synced from Linear',
  render: () => (
    <TaskPage
      title="Implement OAuth2 PKCE flow"
      status="in-progress"
      addable={false}
      properties={
        <>
          <EntityPill glyph={<StatusIcon status="in-progress" size={12} />}>In Review</EntityPill>
          <EntityPill glyph={<PriorityIcon priority="high" size={12} />}>Urgent</EntityPill>
          <EntityPill glyph={Calendar}>Jun 24</EntityPill>
          <EntityPill type="project" color="blue">
            Auth Overhaul
          </EntityPill>
        </>
      }
      links={
        <>
          <SyncedBadge>Linear · ENG-124</SyncedBadge>
          <EntityPill type="event" color="green">
            Mitchell / Jesse 1:1
          </EntityPill>
        </>
      }
      note="Synced 3 min ago"
      description={PKCE_DESCRIPTION}
      subtasks={PKCE_SUBTASKS}
      done={3}
      canAdd={false}
      taskNote={
        <TaskNoteCard
          title="Implement OAuth2 PKCE flow"
          project="Auth Overhaul"
          projectColor="blue"
          tasksSummary="2 tasks · 1 in progress"
          updated="2h ago"
        />
      }
    />
  ),
};
