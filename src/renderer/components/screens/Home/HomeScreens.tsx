/** The Home screens, as components the stories (and other screens' stories) render. */
import type { ReactNode } from 'react';
import { Folder, RotateCw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { CaptureBox } from '../../home/CaptureBox';
import { EventRow } from '../../lists/EventRow';
import { Heading } from '../../layout/Heading';
import { HomeCards, HomeSection } from '../../home/HomeSection';
import { Kbd } from '../../ui/Kbd';
import { Logomark } from '../../ui/Logomark';
import { NoteCard } from '../../notes/NoteCard';
import { NoteRow } from '../../lists/NoteRow';
import { PageContent } from '../../shell/PageHeader';
import { ProjectRow } from '../../lists/ProjectRow';
import { ProviderTile } from '../../entities/ProviderTile';
import { SetupRow } from '../../home/SetupRow';
import { TaskRow } from '../../lists/TaskRow';
import type { Task } from '../../lists/TaskRow/types';
import { Text } from '../../layout/Text';
import { useAppShell } from '../../shell/AppShell/context';
import { ScreenFrame, type ScreenFrameProps } from '../Shell/AppFrame';

const TIP = 'Type “tomorrow” or “#Auth Overhaul” and the details fill in. Press Enter to add.';

const TASKS: Task[] = [
  {
    id: 'refresh',
    title: 'Refactor token refresh logic',
    status: 'in-progress',
    key: 'ENG-131',
    project: 'Auth Overhaul',
    projectColor: 'blue',
    priority: 'high',
    date: 'Jun 18',
    dateTone: 'overdue',
  },
  {
    id: 'audit',
    title: 'Audit token storage',
    status: 'overdue',
    key: 'ENG-118',
    project: 'Auth Overhaul',
    projectColor: 'blue',
    priority: 'high',
    date: 'Jun 19',
    dateTone: 'overdue',
  },
  {
    id: 'pkce',
    title: 'Implement OAuth2 PKCE flow',
    status: 'in-progress',
    key: 'ENG-124',
    subtasks: [3, 4],
    event: 'Mitchell / Jesse 1:1',
    eventColor: 'green',
    project: 'Auth Overhaul',
    projectColor: 'blue',
    priority: 'high',
    date: 'Today',
    dateTone: 'today',
  },
];

/** The words of the summary sentence that stand out. */
function Strong({ children }: { children: ReactNode }) {
  return (
    <Text tone="strong" weight="medium">
      {children}
    </Text>
  );
}

/** Logomark, greeting, summary, the capture box and its tip, the sections and the footer. */
function HomePage({
  greeting = 'Good morning, Mitchell',
  summary,
  tip = TIP,
  paused = true,
  children,
}: {
  greeting?: string;
  summary: ReactNode;
  tip?: string;
  /** Google Calendar is paused: the footer offers Reconnect */
  paused?: boolean;
  children: ReactNode;
}) {
  const { rail } = useAppShell();
  return (
    <PageContent layout="home">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {!rail && <Logomark size="md" style={{ width: 48, marginBottom: 20 }} />}
        <Heading level={1}>{greeting}</Heading>
        <Text tone="muted" align="center" style={{ marginTop: 10, maxWidth: 680 }}>
          {summary}
        </Text>
      </div>
      <CaptureBox tip={tip} style={{ marginTop: 28 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginTop: 28 }}>
        {children}
      </div>
      <Text
        size="xs"
        tone="subtle"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          marginTop: 32,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Press <Kbd>⌘K</Kbd> to search.
        </span>
        {paused && (
          <>
            <span>·</span>
            <span>Google Calendar paused</span>
            <Button variant="ghost" size="xs" icon={RotateCw}>
              Reconnect
            </Button>
          </>
        )}
      </Text>
    </PageContent>
  );
}

function Meetings() {
  return (
    <HomeSection title="Meetings" link="Calendar" more="1 more meeting today">
      <EventRow
        current
        event={{
          title: 'Sprint Planning',
          meeting: true,
          relative: 'In 12 min',
          tone: 'today',
          color: 'green',
        }}
      />
      <EventRow event={{ title: 'Mitchell / Jesse 1:1', relative: '10:30', color: 'green' }} />
      <EventRow event={{ title: 'Design Review', relative: '1:00', color: 'blue' }} />
    </HomeSection>
  );
}

function Tasks({ count = 6, projects = true }: { count?: number; projects?: boolean }) {
  const shown = projects
    ? TASKS
    : TASKS.map((task) => ({ ...task, project: undefined, projectColor: undefined }));
  const more = count - shown.length;
  return (
    <HomeSection
      title="Tasks"
      link={`All ${count} tasks`}
      more={more > 0 ? `${more} more ${more === 1 ? 'task' : 'tasks'} today` : undefined}
    >
      {shown.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </HomeSection>
  );
}

function NotesList() {
  return (
    <HomeSection title="Recent notes" link="All notes">
      <NoteRow title="PKCE design notes" context="Auth Overhaul" edited="6 min ago" />
      <NoteRow title="Mitchell / Jesse 1:1" context="Meeting note" edited="40 min ago" />
      <NoteRow title="Sprint 15 planning" context="Sprint Planning" edited="2h ago" />
    </HomeSection>
  );
}

function NotesCards() {
  return (
    <HomeSection title="Recent notes" link="All notes">
      <HomeCards>
        <NoteCard
          size="sm"
          title="PKCE design notes"
          updated="Yesterday"
          preview="S256 challenge, 96-char verifier and a 10-minute code TTL, behind a feature flag."
        />
        <NoteCard
          size="sm"
          title="Sprint 15 planning"
          updated="Yesterday"
          preview="Ship PKCE behind a flag, finish the token audit, start the rate-limit spike."
        />
        <NoteCard
          size="sm"
          title="Architecture ADR #4 — PKCE"
          updated="Jun 19"
          preview="Adopt PKCE for every public client and retire the implicit flow."
        />
      </HomeCards>
    </HomeSection>
  );
}

function Projects({ empty = false }: { empty?: boolean }) {
  const count = (done: number, total: number) => (empty ? { done: 0, total: 0 } : { done, total });
  return (
    <HomeSection title="Recent projects" link="All projects">
      <ProjectRow
        compact
        project={{ name: 'Auth Overhaul', color: 'blue', ...count(3, 12), due: 'Due Jul 1' }}
      />
      <ProjectRow
        compact
        project={{ name: 'API Gateway v2', color: 'amber', ...count(4, 10), due: 'Due Jun 30' }}
      />
      <ProjectRow
        compact
        project={{
          name: 'ML Platform',
          color: 'pink',
          ...count(6, 10),
          status: empty ? 'not-started' : 'on-hold',
        }}
      />
    </HomeSection>
  );
}

const SETUP = {
  calendar: (
    <SetupRow
      key="calendar"
      icon={<ProviderTile provider="google-calendar" />}
      title="Connect Google Calendar"
      description="Your meetings show up here, and move to the top just before they start."
      action={<Button size="sm">Connect</Button>}
    />
  ),
  linear: (
    <SetupRow
      key="linear"
      icon={<ProviderTile provider="linear" />}
      title="Connect Linear"
      description="Issues assigned to you show up as tasks, and stay in sync."
      action={<Button size="sm">Connect</Button>}
    />
  ),
  project: (
    <SetupRow
      key="project"
      icon={Folder}
      title="Start a project"
      description="Group tasks and notes toward a goal, and see its progress here."
      action={<Button size="sm">Create</Button>}
    />
  ),
};

function GetStarted({ steps }: { steps: (keyof typeof SETUP)[] }) {
  return <HomeSection title="Get started">{steps.map((step) => SETUP[step])}</HomeSection>;
}

/** Figma "Home" (7254:8102): a meeting soon, then today's tasks. Figma "No notes" looks the same. */
export function HomeScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" {...frame}>
      <HomePage
        summary={
          <>
            <Strong>Sprint Planning</Strong> starts in 12 minutes. You have <Strong>6 tasks</Strong>{' '}
            today, and <Text tone="overdue">2 are overdue</Text>.
          </>
        }
      >
        <Meetings />
        <Tasks />
      </HomePage>
    </ScreenFrame>
  );
}

/** Figma "All caught up" (7257:8792): nothing due, a meeting soon, then recent notes as a list. */
export function AllCaughtUpScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" {...frame}>
      <HomePage
        summary={
          <>
            <Text tone="onTrack">Nothing’s due today</Text>. <Strong>Sprint Planning</Strong> starts
            in 12 minutes, and you closed 3 tasks today.
          </>
        }
      >
        <Meetings />
        <NotesList />
      </HomePage>
    </ScreenFrame>
  );
}

/** Figma "Free day" (7261:11556): nothing due and no meetings; notes as cards, then projects. */
export function FreeDayScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" {...frame}>
      <HomePage
        summary={
          <>
            <Text tone="onTrack">Your day is clear</Text>: nothing due and no meetings. Your next
            meeting is tomorrow at 9:30.
          </>
        }
      >
        <NotesCards />
        <Projects />
      </HomePage>
    </ScreenFrame>
  );
}

/** Figma "No events" (7259:11058): today's tasks, then recent notes as a list. */
export function NoEventsScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" {...frame}>
      <HomePage
        summary={
          <>
            You have <Strong>6 tasks</Strong> today, and <Text tone="overdue">2 are overdue</Text>.
            There are no meetings today.
          </>
        }
      >
        <Tasks />
        <NotesList />
      </HomePage>
    </ScreenFrame>
  );
}

/** Figma "No tasks yet" (7257:9513): meetings, then "Get started" offers Linear. */
export function NoTasksYetScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" {...frame}>
      <HomePage
        summary={
          <>
            <Strong>Sprint Planning</Strong> starts in 12 minutes. You don’t have any tasks yet; add
            one in the box above.
          </>
        }
      >
        <Meetings />
        <GetStarted steps={['linear']} />
      </HomePage>
    </ScreenFrame>
  );
}

/** Figma "No tasks or events" (7262:12053): projects, then "Get started" for the calendar and Linear. */
export function NoTasksOrEventsScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" {...frame}>
      <HomePage
        paused={false}
        summary="Nothing on today yet. Add a task above, or connect your calendar and Linear to bring in your work."
      >
        <Projects empty />
        <GetStarted steps={['calendar', 'linear']} />
      </HomePage>
    </ScreenFrame>
  );
}

/** Figma "No projects" (7259:9634): as Home, with no project pills on the tasks. */
export function NoProjectsScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" {...frame}>
      <HomePage
        summary={
          <>
            <Strong>Sprint Planning</Strong> starts in 12 minutes. You have <Strong>6 tasks</Strong>{' '}
            today, and <Text tone="overdue">2 are overdue</Text>.
          </>
        }
      >
        <Meetings />
        <Tasks projects={false} />
      </HomePage>
    </ScreenFrame>
  );
}

/** Figma "First run" (7257:10066): a new workspace; "Get started" fills the sections. */
export function FirstRunScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" emptySidebar {...frame}>
      <HomePage
        greeting="Welcome, Mitchell"
        paused={false}
        tip="Try “Draft Q3 roadmap tomorrow”. Press Enter to add it."
        summary="This is your Home. As you add tasks, notes and meetings, the ones that matter most right now show up here."
      >
        <GetStarted steps={['calendar', 'linear', 'project']} />
      </HomePage>
    </ScreenFrame>
  );
}
