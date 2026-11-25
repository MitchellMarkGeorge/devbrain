/*
 * Sandbox: mock-ups of "Mentioned in", what mentions a task, note or event, on its page and
 * sheet, so every item shows the connections made to it in your notes. Not built; mock data only.
 */
import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority, TaskStatus } from '@common/types';
import { CalendarDays, Clock, Plus, Repeat } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { DateRange } from '../../../detail/DateRange';
import { DetailRow, DetailRows } from '../../../detail/DetailRow';
import { DetailSection } from '../../../detail/DetailSection';
import { EditorContent } from '../../../editor/EditorContent';
import { EntityPill } from '../../../entities/EntityPill';
import { Heading } from '../../../layout/Heading';
import { LinkedTaskRow } from '../../../lists/LinkedTaskRow';
import { PriorityIcon } from '../../../entities/PriorityIcon';
import { ProgressRing } from '../../../ui/ProgressRing';
import { PropertyRow } from '../../../detail/PropertyRow';
import { SheetDivider, SheetHeader, SheetItemTitle } from '../../../ui/Sheet';
import { StatusIcon } from '../../../entities/StatusIcon';
import { TaskList } from '../../../lists/TaskList';
import { TaskNoteCard } from '../../../detail/TaskNoteCard';
import { TooltipProvider } from '../../../ui/Tooltip';
import { ScreenFrame } from '../../Shell/AppFrame';
import { FIGMA_TASKS, TasksToolbar } from '../../Shell/fixtures';
import { CalendarScreen } from '../../Calendar/CalendarScreen';
import { NOW, WEEK_EVENTS } from '../../Calendar/data';
import { CalendarView, calendarEventInput } from '../../../calendar/CalendarView';
import { PageContent } from '../../../shell/Page';
import { TaskRow } from '../../../lists/TaskRow';
import { DetailScreen, DockedSheet, NoteHead } from './frame';
import { PKCE_DESCRIPTION, PKCE_SUBTASKS } from '../../TaskDetail/data';
import { storyDate } from '../../../lib/story-dates';
import { MentionsPill, MentionsSection, TasksPill } from './MentionsSection';
import {
  ADR_MENTIONS,
  ADR_TASK_ROWS,
  ADR_TITLE,
  DESIGN_REVIEW_MENTIONS,
  PKCE_MENTIONS,
  PKCE_TITLE,
} from './data';

const meta = {
  title: 'Sandbox/Mentions',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Tasks list with a task's sheet docked beside it. */
function TasksWithSheet({ children }: { children: ReactNode }) {
  return (
    <ScreenFrame page="Tasks" title="Tasks">
      <TasksToolbar />
      <PageContent layout="list">
        {FIGMA_TASKS.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </PageContent>
      <DockedSheet header={<SheetHeader onOpenAsPage={() => undefined}>Task</SheetHeader>}>
        {children}
      </DockedSheet>
    </ScreenFrame>
  );
}

/** The calendar's week with an event's sheet docked beside it. */
function CalendarWithSheet({ children }: { children: ReactNode }) {
  return (
    <CalendarScreen view="week">
      <CalendarView
        view="week"
        date={NOW}
        now={NOW}
        eventSources={[{ events: WEEK_EVENTS.map(calendarEventInput) }]}
        startHour={8}
        endHour={24}
      />
      <DockedSheet header={<SheetHeader onOpenAsPage={() => undefined}>Event</SheetHeader>}>
        {children}
      </DockedSheet>
    </CalendarScreen>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>{children}</p>;
}

/**
 * The task page: properties, description, subtasks and note. What mentions it is a pill on the
 * links line, "7 mentions", opening the list in a popover under it: one short list needs no
 * sheet, and the page doesn't grow by it.
 */
function TaskPageWithMentions() {
  return (
    <DetailScreen page="Tasks" title={PKCE_TITLE}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingBottom: 64 }}>
        <Heading level={1} variant="document">
          {PKCE_TITLE}
        </Heading>
        <PropertyRow
          properties={
            <>
              <EntityPill glyph={<StatusIcon status={TaskStatus.IN_PROGRESS} size={12} />}>
                In progress
              </EntityPill>
              <EntityPill glyph={<PriorityIcon priority={TaskPriority.HIGH} size={12} />}>
                High
              </EntityPill>
              <DateRange start="Jun 15" due="Jun 24" />
              <EntityPill entity={{ type: 'project', title: 'Auth Overhaul', color: 'blue' }} />
            </>
          }
          links={<MentionsPill mentions={PKCE_MENTIONS} defaultOpen />}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
          {PKCE_DESCRIPTION.map((p) => (
            <p key={p} style={{ margin: 0, lineHeight: '20px' }}>
              {p}
            </p>
          ))}
        </div>
        <DetailSection
          spacing="page"
          title="Subtasks"
          glyph={<ProgressRing value={3} total={4} size={12} />}
          count="3/4"
          action={
            <Button size="xs" icon={Plus}>
              Add
            </Button>
          }
        >
          <TaskList tasks={PKCE_SUBTASKS} selectionBar={false} style={{ marginLeft: -36 }} />
        </DetailSection>
        <DetailSection spacing="page" title="Task note">
          <TaskNoteCard
            title={PKCE_TITLE}
            project="Auth Overhaul"
            projectColor="blue"
            tasksSummary="2 tasks · 1 in progress"
            updated="2h ago"
          />
        </DetailSection>
      </div>
    </DetailScreen>
  );
}

export const TaskPage: Story = {
  name: 'Task page',
  render: () => <TaskPageWithMentions />,
};

/** The task sheet: what mentions it, folded to one line under the task until opened */
export const TaskSheet: Story = {
  name: 'Task sheet',
  render: () => (
    <TasksWithSheet>
      <SheetItemTitle>{PKCE_TITLE}</SheetItemTitle>
      <DetailRows>
        <DetailRow label="Status">
          <EntityPill glyph={<StatusIcon status={TaskStatus.IN_PROGRESS} size={12} />}>
            In progress
          </EntityPill>
        </DetailRow>
        <DetailRow label="Priority">
          <EntityPill glyph={<PriorityIcon priority={TaskPriority.HIGH} size={12} />}>
            High
          </EntityPill>
        </DetailRow>
        <DetailRow label="Dates">
          <EntityPill glyph={CalendarDays}>Jun 15 – Jun 24</EntityPill>
        </DetailRow>
        <DetailRow label="Project">
          <EntityPill entity={{ type: 'project', title: 'Auth Overhaul', color: 'blue' }} />
        </DetailRow>
      </DetailRows>
      <SheetDivider />
      <Paragraph>
        Replace the implicit-flow handoff with PKCE for every first-party client, on web and mobile.
      </Paragraph>
      <DetailSection title="Task note" style={{ gap: 8 }}>
        <TaskNoteCard title={PKCE_TITLE} tasksSummary="2 tasks · 1 in progress" updated="2h ago" />
      </DetailSection>
      <MentionsSection variant="sheet" collapsible defaultOpen={false} mentions={PKCE_MENTIONS} />
    </TasksWithSheet>
  ),
};

/**
 * The note page: its tasks and what mentions it are pills in its header, "2 tasks" and
 * "4 mentions", each opening its list in a popover, so nothing sits under the text.
 */
export const NotePageMentions: Story = {
  name: 'Note page',
  render: () => (
    <DetailScreen page="Notes" title={ADR_TITLE}>
      <NoteHead
        title={ADR_TITLE}
        pills={
          <>
            <EntityPill entity={{ type: 'project', title: 'Auth Overhaul', color: 'blue' }} />
            <TasksPill tasks={ADR_TASK_ROWS} label="2 tasks · 1 in progress" />
            <MentionsPill mentions={ADR_MENTIONS} defaultOpen />
          </>
        }
      />
      <EditorContent style={{ marginTop: 32 }}>
        <p>
          Status: accepted. The implicit flow returns tokens in the URL fragment, where they leak
          into browser history, logs and referrer headers.
        </p>
        <h2>Decision</h2>
        <ul>
          <li>Use the S256 challenge method and reject plain challenges.</li>
          <li>Generate a new 96-character code verifier for every sign-in.</li>
          <li>Expire authorization codes after 10 minutes.</li>
        </ul>
      </EditorContent>
    </DetailScreen>
  ),
};

/** The event sheet: the notes and tasks that mention the meeting */
export const EventSheet: Story = {
  name: 'Event sheet',
  render: () => (
    <CalendarWithSheet>
      <SheetItemTitle barColor="blue">Design Review</SheetItemTitle>
      <DetailRows>
        <DetailRow label="Date">
          <EntityPill glyph={CalendarDays}>Mon, Jun 22</EntityPill>
        </DetailRow>
        <DetailRow label="Time">
          <EntityPill glyph={Clock}>1:00 – 2:00 PM (EDT)</EntityPill>
        </DetailRow>
        <DetailRow label="Repeats">
          <EntityPill glyph={Repeat}>Every week</EntityPill>
        </DetailRow>
      </DetailRows>
      <SheetDivider />
      <DetailSection title="Linked tasks" count={1}>
        <div>
          <LinkedTaskRow
            task={{
              title: 'Create user interface mockups',
              status: TaskStatus.NOT_STARTED,
              dueDate: storyDate(8),
            }}
          />
        </div>
      </DetailSection>
      <MentionsSection variant="sheet" mentions={DESIGN_REVIEW_MENTIONS} />
    </CalendarWithSheet>
  ),
};

/** The section alone: none yet, a few, and more than fit with "Show n more" */
export const States: Story = {
  render: () => (
    <TooltipProvider>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '720px 380px',
          gap: 48,
          padding: 48,
          background: 'var(--background)',
          color: 'var(--foreground)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
          <MentionsSection mentions={[]} />
          <MentionsSection mentions={ADR_MENTIONS} />
          <MentionsSection mentions={PKCE_MENTIONS} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
          <MentionsSection variant="sheet" mentions={[]} />
          <MentionsSection
            variant="sheet"
            collapsible
            defaultOpen={false}
            mentions={PKCE_MENTIONS}
          />
        </div>
      </div>
    </TooltipProvider>
  ),
};
