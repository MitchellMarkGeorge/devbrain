/*
 * Sandbox: mock-ups of "Linked from", the backlinks of a task, note or event on its page and
 * sheet, so every item shows the connections made to it. Not built; mock data only.
 */
import { useRef, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority, TaskStatus } from '@common/types';
import { CalendarDays, CircleCheck, Clock, Plus, Repeat } from 'lucide-react';
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
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDivider,
  SheetHeader,
  SheetItemTitle,
} from '../../../ui/Sheet';
import { StatusIcon } from '../../../entities/StatusIcon';
import { TaskList } from '../../../lists/TaskList';
import { TaskNoteCard } from '../../../detail/TaskNoteCard';
import { TooltipProvider } from '../../../ui/Tooltip';
import { AppWindow, DetailPage, DetailTopBar } from '../../TaskDetail/frame';
import { PKCE_DESCRIPTION, PKCE_SUBTASKS } from '../../TaskDetail/data';
import { NotePage } from '../../Notes/notePage';
import { storyDate } from '../../../lib/story-dates';
import { BacklinksSection } from './BacklinksSection';
import {
  ADR_BACKLINKS,
  ADR_TITLE,
  DESIGN_REVIEW_BACKLINKS,
  PKCE_BACKLINKS,
  PKCE_TITLE,
} from './data';

const meta = {
  title: 'Sandbox/Backlinks',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function SheetColumn({ name, children }: { name: string; children: ReactNode }) {
  const column = useRef<HTMLDivElement>(null);
  return (
    <TooltipProvider>
      <div style={{ display: 'flex', height: 1024, background: 'var(--background)' }}>
        <div ref={column} style={{ position: 'relative', width: 'var(--sheet-width)' }} />
        <Sheet open>
          <SheetContent container={column}>
            <SheetHeader onOpenAsPage={() => undefined}>{name}</SheetHeader>
            <SheetBody>{children}</SheetBody>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>{children}</p>;
}

/** The task page: properties, description, subtasks and note, then what links here */
export const TaskPage: Story = {
  name: 'Task page',
  render: () => (
    <AppWindow active="Tasks" height={1500}>
      <DetailPage
        top={
          <DetailTopBar
            items={[
              { label: 'Tasks', href: '#' },
              { label: PKCE_TITLE, icon: <StatusIcon status={TaskStatus.IN_PROGRESS} /> },
            ]}
          />
        }
      >
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
          <BacklinksSection selfLabel="this task" backlinks={PKCE_BACKLINKS} />
        </div>
      </DetailPage>
    </AppWindow>
  ),
};

/** The task sheet: what links here, titles only */
export const TaskSheet: Story = {
  name: 'Task sheet',
  render: () => (
    <SheetColumn name="Task">
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
        <TaskNoteCard
          title={PKCE_TITLE}
          tasksSummary="2 tasks · 1 in progress"
          updated="2h ago"
          layout="stacked"
        />
      </DetailSection>
      <BacklinksSection variant="sheet" selfLabel="this task" backlinks={PKCE_BACKLINKS} />
    </SheetColumn>
  ),
};

/** The note page: after its Tasks, the notes, tasks and events that link to it */
export const NotePageBacklinks: Story = {
  name: 'Note page',
  render: () => (
    <NotePage
      title={ADR_TITLE}
      edited="Edited yesterday"
      pills={
        <>
          <EntityPill entity={{ type: 'project', title: 'Auth Overhaul', color: 'blue' }} />
          <EntityPill glyph={CircleCheck}>1 task · 1 in progress</EntityPill>
        </>
      }
    >
      <EditorContent>
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
      <SheetDivider style={{ margin: '24px 0 16px' }} />
      <BacklinksSection selfLabel="this note" backlinks={ADR_BACKLINKS} />
    </NotePage>
  ),
};

/** The event sheet: the notes and tasks that link to the meeting */
export const EventSheet: Story = {
  name: 'Event sheet',
  render: () => (
    <SheetColumn name="Event">
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
      <BacklinksSection
        variant="sheet"
        selfLabel="this event"
        backlinks={DESIGN_REVIEW_BACKLINKS}
      />
    </SheetColumn>
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
          <BacklinksSection selfLabel="this task" backlinks={[]} />
          <BacklinksSection selfLabel="this note" backlinks={ADR_BACKLINKS} />
          <BacklinksSection selfLabel="this task" backlinks={PKCE_BACKLINKS} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
          <BacklinksSection variant="sheet" selfLabel="this task" backlinks={[]} />
          <BacklinksSection variant="sheet" selfLabel="this task" backlinks={PKCE_BACKLINKS} />
        </div>
      </div>
    </TooltipProvider>
  ),
};
