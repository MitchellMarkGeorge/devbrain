import { useRef, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  CalendarDays,
  Clock,
  ExternalLink,
  Folder as FolderGlyph,
  MapPin,
  Plus,
  Repeat,
  Video,
} from 'lucide-react';
import { AddSlot } from '../../ui/AddSlot';
import { Button } from '../../ui/Button';
import { DetailRow, DetailRows, ReadOnlyRow } from '../../ui/DetailRow';
import { DetailSection } from '../../ui/DetailSection';
import { EntityPill } from '../../ui/EntityPill';
import { LinkedTaskRow } from '../../ui/LinkedTaskRow';
import { PriorityIcon } from '../../ui/PriorityIcon';
import { ProgressRing } from '../../ui/ProgressRing';
import { GoogleCalendarLogo } from '../../ui/ProviderLogo';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDivider,
  SheetHeader,
  SheetItemTitle,
} from '../../ui/Sheet';
import { StatusIcon } from '../../ui/StatusIcon';
import { SyncedBadge } from '../../ui/SyncedBadge';
import { TaskNoteCard } from '../../ui/TaskNoteCard';
import { TooltipProvider } from '../../ui/Tooltip';

const meta = {
  title: 'Screens/Sheets',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The docked sheet alone: the 380px column on the right of a 1024px-tall window. */
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

const SUBTASKS = [
  { title: 'Generate code verifier', status: 'completed', date: 'Jun 16' },
  { title: 'S256 challenge', status: 'completed', date: 'Jun 17' },
  { title: 'Token exchange endpoint', status: 'completed', date: 'Jun 19' },
  { title: 'Mobile fallback', status: 'not-started', date: 'Jun 24' },
] as const;

function Paragraph({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 14, lineHeight: '20px' }}>{children}</p>;
}

function Subtasks({ canAdd = true }: { canAdd?: boolean }) {
  return (
    <DetailSection
      title="Subtasks"
      glyph={<ProgressRing value={3} total={4} size={12} />}
      count="3/4"
      action={
        canAdd && (
          <Button size="xs" icon={Plus}>
            Add
          </Button>
        )
      }
    >
      <div>
        {SUBTASKS.map((t) => (
          <LinkedTaskRow
            key={t.title}
            title={t.title}
            status={t.status}
            date={t.date}
            onOpen={() => undefined}
          />
        ))}
      </div>
    </DetailSection>
  );
}

/** Tasks board – task sheet (7175:31599), the sheet alone: a local task, every value a pill */
export const TaskSheet: Story = {
  name: 'Tasks board – task sheet',
  render: () => (
    <SheetColumn name="Task">
      <SheetItemTitle>Implement OAuth2 PKCE flow</SheetItemTitle>
      <DetailRows>
        <DetailRow label="Status">
          <EntityPill glyph={<StatusIcon status="in-progress" size={12} />}>In progress</EntityPill>
        </DetailRow>
        <DetailRow label="Priority">
          <EntityPill glyph={<PriorityIcon priority="high" size={12} />}>High</EntityPill>
        </DetailRow>
        <DetailRow label="Dates">
          <EntityPill glyph={CalendarDays}>Jun 15 – Jun 24</EntityPill>
        </DetailRow>
        <DetailRow label="Project">
          <EntityPill type="project" color="blue">
            Auth Overhaul
          </EntityPill>
        </DetailRow>
        <DetailRow label="Event">
          <EntityPill type="event" color="green">
            Mitchell / Jesse 1:1
          </EntityPill>
        </DetailRow>
      </DetailRows>
      <SheetDivider />
      <Paragraph>
        Replace the implicit-flow handoff with PKCE for every first-party client, on web and mobile.
        S256 challenge, 96-character code verifier, 10-minute auth code lifetime.
      </Paragraph>
      <Subtasks />
      <DetailSection title="Task note" style={{ gap: 8 }}>
        <TaskNoteCard
          title="Implement OAuth2 PKCE flow"
          tasksSummary="2 tasks · 1 in progress"
          updated="2h ago"
          layout="stacked"
        />
      </DetailSection>
    </SheetColumn>
  ),
};

/** The task sheet for a Linear task: the synced badge, Linear's values as read-only rows */
export const TaskSheetLinear: Story = {
  name: 'Task sheet – synced from Linear',
  render: () => (
    <SheetColumn name="Task">
      <SheetItemTitle>Implement OAuth2 PKCE flow</SheetItemTitle>
      <SyncedBadge>Linear · ENG-124</SyncedBadge>
      <DetailRows>
        <ReadOnlyRow label="Status" glyph={<StatusIcon status="in-progress" size={14} />}>
          In Review
        </ReadOnlyRow>
        <ReadOnlyRow label="Priority" glyph={<PriorityIcon priority="high" size={14} />}>
          Urgent
        </ReadOnlyRow>
        <ReadOnlyRow label="Due date" glyph={CalendarDays}>
          Jun 24
        </ReadOnlyRow>
        <ReadOnlyRow label="Project" glyph={FolderGlyph} glyphColor="var(--swatch-blue)">
          Auth Overhaul
        </ReadOnlyRow>
        <DetailRow label="Event">
          <EntityPill type="event" color="green">
            Mitchell / Jesse 1:1
          </EntityPill>
        </DetailRow>
      </DetailRows>
      <SyncHint provider="Linear" open="Open in Linear" detach />
      <SheetDivider />
      <Paragraph>
        Replace the implicit-flow handoff with PKCE for every first-party client, on web and mobile.
        S256 challenge, 96-character code verifier, 10-minute auth code lifetime.
      </Paragraph>
      <Subtasks canAdd={false} />
      <DetailSection title="Task note" style={{ gap: 8 }}>
        <TaskNoteCard
          title="Implement OAuth2 PKCE flow"
          project="Auth Overhaul"
          projectColor="blue"
          tasksSummary="2 tasks · 1 in progress"
          updated="2h ago"
          layout="stacked"
        />
      </DetailSection>
    </SheetColumn>
  ),
};

/** "Synced from Linear 3 min ago · Edit in Linear", then Open in … and Detach… */
function SyncHint({
  provider,
  open,
  detach,
}: {
  provider: string;
  open: string;
  detach?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ color: 'var(--subtle-foreground)', fontSize: 12, lineHeight: '16px' }}>
        Synced from {provider} 3 min ago · Edit in {provider}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="sm" icon={ExternalLink}>
          {open}
        </Button>
        {detach && (
          <Button size="sm" variant="ghost">
            Detach…
          </Button>
        )}
      </div>
    </div>
  );
}

function MeetingValue() {
  return (
    <>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--muted-foreground)',
          fontSize: 14,
        }}
      >
        meet.google.com/qvx-ptdm-kca
      </span>
      <Button size="xs" icon={Video}>
        Join
      </Button>
    </>
  );
}

/** Calendar week – event sheet (7175:30140), the sheet alone: a local event */
export const EventSheet: Story = {
  name: 'Calendar week – event sheet',
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
        <DetailRow label="Calendar">
          <EntityPill type="event" color="blue">
            Work
          </EntityPill>
        </DetailRow>
        <DetailRow label="Location">
          <EntityPill glyph={MapPin}>Room 4B</EntityPill>
        </DetailRow>
        <DetailRow label="Meeting">
          <MeetingValue />
        </DetailRow>
      </DetailRows>
      <SheetDivider />
      <Paragraph>
        Walk through the user interface mockups and agree what ships in the first revamp milestone.
      </Paragraph>
      <DetailSection title="Event note" style={{ gap: 8 }}>
        <AddSlot>Add a note</AddSlot>
      </DetailSection>
      <DetailSection
        title="Linked tasks"
        count={2}
        action={
          <Button size="xs" icon={Plus}>
            Add
          </Button>
        }
      >
        <div>
          <LinkedTaskRow title="Create user interface mockups" status="not-started" date="Jun 30" />
          <LinkedTaskRow
            title="Write PKCE migration guide"
            status="not-started"
            date="Today"
            dateTone="today"
          />
        </div>
      </DetailSection>
    </SheetColumn>
  ),
};

/** The event sheet for a Google Calendar event: read-only rows and the sync hint */
export const EventSheetGoogle: Story = {
  name: 'Event sheet – Google Calendar',
  render: () => (
    <SheetColumn name="Event">
      <SheetItemTitle barColor="indigo">Engineering All-hands</SheetItemTitle>
      <SyncedBadge logo={<GoogleCalendarLogo size={16} />}>
        Google Calendar · Engineering
      </SyncedBadge>
      <DetailRows>
        <ReadOnlyRow label="Date" glyph={CalendarDays}>
          Fri, Jun 26
        </ReadOnlyRow>
        <ReadOnlyRow label="Time" glyph={Clock}>
          11:00 AM – 12:00 PM (EDT)
        </ReadOnlyRow>
        <ReadOnlyRow label="Repeats" glyph={Repeat}>
          Every 2 weeks
        </ReadOnlyRow>
        <ReadOnlyRow label="Calendar" glyph={<CalendarBar color="var(--swatch-indigo)" />}>
          Engineering
        </ReadOnlyRow>
        <ReadOnlyRow label="Location" glyph={MapPin}>
          Atrium, 4th floor
        </ReadOnlyRow>
        <DetailRow label="Meeting">
          <MeetingValue />
        </DetailRow>
      </DetailRows>
      <SyncHint provider="Google Calendar" open="Open in Google Calendar" />
      <SheetDivider />
      <Paragraph>
        Roadmap update, team news and open Q&amp;A. Post questions in #eng-allhands beforehand.
      </Paragraph>
      <DetailSection title="Event note" style={{ gap: 8 }}>
        <AddSlot>Add a note</AddSlot>
      </DetailSection>
      <DetailSection
        title="Linked tasks"
        action={
          <Button size="xs" icon={Plus}>
            Add
          </Button>
        }
      >
        <AddSlot>Link a task</AddSlot>
      </DetailSection>
    </SheetColumn>
  ),
};

function CalendarBar({ color }: { color: string }) {
  return (
    <span style={{ display: 'inline-flex', justifyContent: 'center', width: 14 }}>
      <span style={{ width: 3, height: 12, borderRadius: 2, background: color }} />
    </span>
  );
}

/** Google Calendar's mark, the 16px size of a SyncedBadge logo */
