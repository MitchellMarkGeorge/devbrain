/** The Home screens, as components the stories (and other screens' stories) render. */
import type { ReactNode } from 'react';
import { CalendarDays, FileText, Folder, CircleCheck, RotateCw, Video } from 'lucide-react';
import { Heading } from '../../layout/Heading';
import { Text } from '../../layout/Text';
import {
  HomeAgendaDivider,
  HomeAgendaEmpty,
  HomeAgendaNotice,
  HomeAgendaRow,
  HomeAgendaSection,
} from '../../home/HomeAgenda';
import { Button } from '../../ui/Button';
import { Calendar } from '../../ui/Calendar';
import { CardGrid } from '../../shell/CardGrid';
import { ColourBar } from '../../ui/ColourBar';
import { EntityPill } from '../../entities/EntityPill';
import { HomeNotice } from '../../home/HomeNotice';
import { Kbd } from '../../ui/Kbd';
import { Logomark } from '../../ui/Logomark';
import { NoteCard } from '../../notes/NoteCard';
import { PageContent } from '../../shell/PageHeader';
import { ProjectCard } from '../../projects/ProjectCard';
import { ProviderTile } from '../../entities/ProviderTile';
import { QuickStartCard, QuickStartTiles } from '../../home/QuickStartCard';
import { SectionHeading } from '../../home/SectionHeading';
import { StatusIcon } from '../../entities/StatusIcon';
import { TaskRow } from '../../lists/TaskRow';
import type { Task } from '../../lists/TaskRow/types';
import { UpNextStrip } from '../../home/UpNextStrip';
import { ScreenFrame, type ScreenFrameProps } from '../Shell/AppFrame';

const TODAY = new Date(2026, 5, 22);

const TODAY_TASKS: Task[] = [
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
    status: 'not-started',
    key: 'ENG-118',
    project: 'Auth Overhaul',
    projectColor: 'blue',
    priority: 'high',
    date: 'Jun 19',
    dateTone: 'overdue',
  },
  {
    id: 'guide',
    title: 'Write PKCE migration guide',
    status: 'not-started',
    note: 'PKCE design notes',
    project: 'Auth Overhaul',
    projectColor: 'blue',
    priority: 'medium',
    date: 'Today',
    dateTone: 'today',
  },
  {
    id: 'capacity',
    title: 'Prepare capacity estimate',
    status: 'in-progress',
    event: 'Sprint Planning',
    eventColor: 'green',
    project: 'AI Action Items',
    projectColor: 'blue',
    priority: 'medium',
    date: 'Today',
    dateTone: 'today',
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
  {
    id: 'feedback',
    title: 'Summarise sprint feedback',
    status: 'not-started',
    event: 'Sprint Planning',
    eventColor: 'green',
    project: 'AI Action Items',
    projectColor: 'blue',
    priority: 'low',
    date: 'Today',
    dateTone: 'today',
  },
];

const UP_NEXT_TASKS: Task[] = [
  {
    id: 'bench',
    title: 'Benchmark inference latency',
    status: 'in-progress',
    key: 'ENG-152',
    project: 'ML Platform',
    projectColor: 'pink',
    priority: 'medium',
    date: 'Tue',
    dateTone: 'today',
  },
  { ...TODAY_TASKS[4], date: 'Wed', dateTone: undefined },
  { ...TODAY_TASKS[2], date: 'Wed', dateTone: undefined },
  {
    id: 'database',
    title: 'Integrate database connection',
    status: 'not-started',
    key: 'ENG-140',
    project: 'API Gateway v2',
    projectColor: 'amber',
    priority: 'medium',
    date: 'Fri',
  },
  {
    id: 'mockups',
    title: 'Create user interface mockups',
    status: 'not-started',
    project: 'User Interface Revamp',
    projectColor: 'indigo',
    priority: 'low',
    date: 'Jun 30',
  },
];

function Greeting({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Heading level={1}>Good morning, Mitchell.</Heading>
      <Text tone="muted">{children}</Text>
    </div>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</section>;
}

function Cards({ children }: { children: ReactNode }) {
  return <CardGrid singleRow>{children}</CardGrid>;
}

function Projects() {
  return (
    <Section>
      <SectionHeading title="Projects" link="All projects" />
      <Cards>
        <ProjectCard
          name="Auth Overhaul"
          color="blue"
          due="Due Jul 1"
          done={3}
          total={12}
          status="active"
        />
        <ProjectCard
          name="API Gateway v2"
          color="amber"
          due="Due Jun 30"
          done={4}
          total={10}
          status="active"
        />
        <ProjectCard
          name="ML Platform"
          color="pink"
          due="Due Jul 10"
          done={6}
          total={10}
          status="on-hold"
        />
      </Cards>
    </Section>
  );
}

function RecentNotes() {
  return (
    <Section>
      <SectionHeading title="Recent notes" link="All notes" />
      <Cards>
        <NoteCard
          title="PKCE design notes"
          updated="2h ago"
          preview="S256 challenge, 96-char verifier and a 10-minute code TTL, behind a feature flag."
        />
        <NoteCard
          title="Architecture ADR #4 — PKCE"
          updated="Yesterday"
          preview="Adopt PKCE for every public client and retire the implicit flow."
        />
        <NoteCard
          title="API Gateway rate limits"
          updated="Jun 18"
          preview="Token bucket per API key: 100 requests a minute with bursts of 20."
        />
      </Cards>
    </Section>
  );
}

function LaterThisWeek() {
  return (
    <HomeAgendaSection title="Later this week" days>
      <HomeAgendaRow
        time="Wed 24"
        glyph={<StatusIcon status="in-progress" size={12} />}
        title="PKCE flow due"
        more="+1"
      />
      <HomeAgendaRow
        time="Thu 25"
        glyph={<ColourBar color="pink" />}
        title="ML Platform Review"
        more="+1"
      />
      <HomeAgendaRow
        time="Fri 26"
        glyph={<ColourBar color="indigo" />}
        title="Engineering All-hands"
        more="+3"
      />
      <HomeAgendaRow time="Weekend" title="Nothing planned" empty />
    </HomeAgendaSection>
  );
}

function Tomorrow() {
  return (
    <HomeAgendaSection title="Tomorrow">
      <HomeAgendaRow time="9:30" glyph={<ColourBar color="green" />} title="Daily Standup" />
      <HomeAgendaRow
        time="Due"
        glyph={<StatusIcon status="in-progress" size={12} />}
        title="Benchmark inference latency"
      />
    </HomeAgendaSection>
  );
}

function HomeAside({ freeDay = false }: { freeDay?: boolean }) {
  return (
    <>
      <Calendar today={TODAY} defaultMonth={TODAY} />
      <HomeAgendaDivider />
      {freeDay ? (
        <HomeAgendaSection title="Today" aside="No meetings">
          <HomeAgendaEmpty>Nothing scheduled and nothing due.</HomeAgendaEmpty>
        </HomeAgendaSection>
      ) : (
        <HomeAgendaSection title="Later today" aside="3 meetings">
          <HomeAgendaRow
            time="10:30"
            glyph={<ColourBar color="green" />}
            title="Mitchell / Jesse 1:1"
          />
          <HomeAgendaRow time="1:00" glyph={<ColourBar color="blue" />} title="Design Review" />
          <HomeAgendaRow time="4:00" glyph={<ColourBar color="amber" />} title="Retrospective" />
        </HomeAgendaSection>
      )}
      <HomeAgendaDivider />
      <Tomorrow />
      <HomeAgendaDivider />
      <LaterThisWeek />
      {!freeDay && (
        <HomeAgendaNotice
          style={{ marginTop: 'auto' }}
          icon={<ProviderTile provider="google-calendar" size={20} />}
          title="Google Calendar paused"
          description="Sign in again to keep today’s meetings up to date."
          action={
            <Button size="sm" icon={RotateCw} style={{ width: '100%' }}>
              Reconnect
            </Button>
          }
        />
      )}
    </>
  );
}

function HomePage({ children }: { children: ReactNode }) {
  return (
    <PageContent layout="home">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>{children}</div>
    </PageContent>
  );
}

/** Figma "Home" (7254:8102): greeting, the up-next strip, today's tasks, projects and notes, and the right column. */
export function HomeScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" aside={<HomeAside />} {...frame}>
      <HomePage>
        <Greeting>
          You have{' '}
          <Text tone="strong" weight="medium">
            6 tasks
          </Text>{' '}
          and{' '}
          <Text tone="strong" weight="medium">
            4 meetings
          </Text>{' '}
          today. Let’s get to work.
        </Greeting>
        <UpNextStrip
          state="meeting"
          title="Sprint Planning"
          color="green"
          countdown="In 12 min"
          time="9:00 – 10:00 AM"
          note={<EntityPill type="note">Sprint 15 planning</EntityPill>}
          action={
            <Button size="sm" icon={Video}>
              Join
            </Button>
          }
        />
        <Section>
          <SectionHeading title="Today" link="All tasks" />
          <div>
            {TODAY_TASKS.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </Section>
        <Projects />
        <RecentNotes />
      </HomePage>
    </ScreenFrame>
  );
}

/** Figma "Home — free day" (7261:11556): no meetings and nothing due today. */
export function FreeDayScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" aside={<HomeAside freeDay />} {...frame}>
      <HomePage>
        <Greeting>Nothing’s due and there are no meetings today.</Greeting>
        <UpNextStrip
          state="free"
          title="All day"
          next="Next meeting tomorrow, 9:30"
          nextColor="green"
          suggestion="Benchmark inference latency"
          suggestionIcon={<StatusIcon status="in-progress" size={14} />}
        />
        <HomeNotice
          icon={<StatusIcon status="completed" size={20} />}
          title="Your day is clear"
          description={
            <>
              No meetings and nothing due today. You closed <strong>8 tasks</strong> this week.
            </>
          }
          action={<Button icon={CalendarDays}>Review Week</Button>}
        />
        <Section>
          <SectionHeading
            title="Up next"
            description="Tomorrow and later this week"
            link="All tasks"
          />
          <div>
            {UP_NEXT_TASKS.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </Section>
        <Projects />
        <RecentNotes />
      </HomePage>
    </ScreenFrame>
  );
}

/** Figma "Home — first run" (7257:10066): a new workspace, centred welcome and quick start cards. */
export function FirstRunScreen(frame: Partial<ScreenFrameProps>) {
  return (
    <ScreenFrame page="Home" emptySidebar {...frame}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 800,
          margin: '310px auto 0',
          textAlign: 'center',
        }}
      >
        <Logomark size="md" style={{ width: 48 }} />
        <Heading level={1} style={{ marginTop: 24 }}>
          Welcome, Mitchell
        </Heading>
        <Text tone="muted" style={{ marginTop: 10, maxWidth: 520 }}>
          SurveyMonkey is your workspace. Capture tasks, write notes and plan projects. Everything
          you do shows up here.
        </Text>
        <div style={{ alignSelf: 'stretch', marginTop: 28, textAlign: 'left' }}>
          <Text size="xs" tone="muted" weight="medium" style={{ display: 'block', height: 26 }}>
            Quick start
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <QuickStartCard
              icon={CircleCheck}
              title="New task"
              description="Track something you need to do."
            />
            <QuickStartCard
              icon={FileText}
              title="New note"
              description="A doc, meeting notes or a quick thought."
            />
            <QuickStartCard
              icon={Folder}
              title="New project"
              description="Group tasks and notes toward a goal."
            />
            <QuickStartCard
              icon={
                <QuickStartTiles>
                  <ProviderTile provider="linear" />
                  <ProviderTile provider="google-calendar" />
                </QuickStartTiles>
              }
              title="Bring in your work"
              description="Connect Linear and Google Calendar."
            />
          </div>
        </div>
        <Text
          size="xs"
          tone="subtle"
          style={{ marginTop: 28, display: 'inline-flex', gap: 6, alignItems: 'center' }}
        >
          Press <Kbd>⌘K</Kbd> to search.
        </Text>
      </div>
    </ScreenFrame>
  );
}
