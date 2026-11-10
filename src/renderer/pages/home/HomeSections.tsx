import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { Folder } from 'lucide-react';
import type { Calendar, Project, TaskListItem } from '@common/types';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  HomeCards,
  HomeMeetingRow,
  HomeRow,
  HomeRowNote,
  HomeSection,
  NoteCard,
  Progress,
  ProjectGlyph,
  PROJECT_STATUS_LABELS,
  ProviderTile,
  resolveColor,
  SetupRow,
  TaskRow,
  useFormat,
} from '../../components';
import { dueText } from '../../components/lib/format';
import { trpc } from '../../ipc';
import { entityPath } from '../app/entities';
import { useOpenEntity } from '../app/use-open-entity';
import { TaskMenuItems } from '../tasks/menus/TaskMenus';
import { useTaskActions } from '../tasks/use-task-actions';
import type { HomeSectionChoice, SetupStep } from './summary';

type Section<K> = Extract<NonNullable<HomeSectionChoice>, { kind: K }>;

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** Home's one section, as `summarizeHome` chose it. */
export function HomeSectionView({ section }: { section: NonNullable<HomeSectionChoice> }) {
  switch (section.kind) {
    case 'meetings':
      return <MeetingsSection section={section} />;
    case 'tasks':
      return <TasksSection section={section} />;
    case 'projects':
      return <ProjectsSection section={section} />;
    case 'notes':
      return <NotesSection section={section} />;
    case 'getStarted':
      return <GetStartedSection steps={section.steps} />;
  }
}

/** Goes to one of the workspace's pages. */
function useGoTo() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  return (page: 'tasks' | 'projects' | 'notes' | 'calendar' | 'integrations') =>
    void navigate({ to: `/app/$workspaceId/${page}`, params: { workspaceId } });
}

function MeetingsSection({ section }: { section: Section<'meetings'> }) {
  const goTo = useGoTo();
  const openEntity = useOpenEntity();
  const calendars = useQuery(trpc.calendars.list.queryOptions()).data;
  // through main, which checks the link (docs/security/untrusted-content.md)
  const { mutate: openUrl } = useMutation(trpc.workspace.openUrl.mutationOptions());
  const colorOf = (id: string) => calendars?.find((c: Calendar) => c.id === id)?.color;
  return (
    <HomeSection
      title="Meetings"
      link="Calendar"
      onLinkClick={() => goTo('calendar')}
      more={section.more > 0 ? `${plural(section.more, 'more meeting')} today` : undefined}
    >
      {section.rows.map(({ meeting, current, joinable, muted }) => (
        <HomeMeetingRow
          key={meeting.key}
          event={{ ...meeting.event, startAt: meeting.start, endAt: meeting.end }}
          calendarColor={colorOf(meeting.event.calendarId)}
          current={current}
          muted={muted}
          onJoin={
            joinable && meeting.event.meetingUrl
              ? () => openUrl({ url: meeting.event.meetingUrl! })
              : undefined
          }
          onOpen={() => openEntity({ id: meeting.event.id, startAt: meeting.start })}
        />
      ))}
    </HomeSection>
  );
}

function TasksSection({ section }: { section: Section<'tasks'> }) {
  const goTo = useGoTo();
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  return (
    <HomeSection
      title="Tasks"
      link={`All ${plural(section.total, 'task')}`}
      onLinkClick={() => goTo('tasks')}
      more={section.more > 0 ? `${plural(section.more, 'more task')} today` : undefined}
    >
      {section.rows.map((task) => (
        <HomeTaskRow
          key={task.id}
          task={task}
          actions={actions}
          onOpen={() => openEntity({ id: task.id })}
        />
      ))}
    </HomeSection>
  );
}

/** A compact task row with the list's actions: status, due date, and the right-click menu. */
function HomeTaskRow({
  task,
  actions,
  onOpen,
}: {
  task: TaskListItem;
  actions: ReturnType<typeof useTaskActions>;
  onOpen: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger style={{ display: 'contents' }}>
        <TaskRow
          task={task}
          compact
          onOpen={onOpen}
          onStatusChange={(status) => actions.setStatus([task], status)}
          onDueDateChange={(date) => actions.setDueDate([task], date)}
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <TaskMenuItems task={task} actions={actions} onOpen={onOpen} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ProjectsSection({ section }: { section: Section<'projects'> }) {
  const goTo = useGoTo();
  return (
    <HomeSection title="Recent projects" link="All projects" onLinkClick={() => goTo('projects')}>
      {section.rows.map((project) => (
        <HomeProjectRow key={project.id} project={project} />
      ))}
    </HomeSection>
  );
}

/** A project: its folder, name, progress (from `projects.stats`), then its due date or status. */
function HomeProjectRow({ project }: { project: Project }) {
  const openEntity = useOpenEntity();
  const format = useFormat();
  const stats = useQuery(trpc.projects.stats.queryOptions({ id: project.id })).data;
  const done = stats?.numOfCompleted ?? 0;
  const total = stats?.totalTasks ?? 0;
  const overdue = project.dueDate !== null && project.dueDate < format.now;
  return (
    <HomeRow
      icon={<ProjectGlyph color={resolveColor(project.color, 'blue') ?? 'blue'} />}
      title={project.title}
      meta={
        project.dueDate ? dueText(project.dueDate, format) : PROJECT_STATUS_LABELS[project.status]
      }
      metaTone={overdue ? 'overdue' : undefined}
      onOpen={() => openEntity({ id: project.id })}
    >
      <Progress
        value={total ? Math.round((done / total) * 100) : 0}
        aria-label={`${project.title}: ${done} of ${total} tasks done`}
        style={{ width: 96 }}
      />
      <HomeRowNote style={{ width: 36 }}>
        {done}/{total}
      </HomeRowNote>
    </HomeRow>
  );
}

function NotesSection({ section }: { section: Section<'notes'> }) {
  const goTo = useGoTo();
  const router = useRouter();
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  return (
    <HomeSection title="Recent notes" link="All notes" onLinkClick={() => goTo('notes')}>
      <HomeCards>
        {section.rows.map((note) => (
          <NoteCard
            key={note.id}
            size="sm"
            note={{ ...note, project: null, link: null }}
            render={
              <a href={router.history.createHref(entityPath(workspaceId, { id: note.id }) ?? '')} />
            }
          />
        ))}
      </HomeCards>
    </HomeSection>
  );
}

const SETUP: Record<SetupStep, { title: string; description: string }> = {
  calendar: {
    title: 'Connect Google Calendar',
    description: 'Your meetings show up here, and move to the top just before they start.',
  },
  linear: {
    title: 'Connect Linear',
    description: 'Issues assigned to you show up as tasks, and stay in sync.',
  },
  project: {
    title: 'Start a project',
    description: 'Group tasks and notes toward a goal, and see its progress here.',
  },
};

/**
 * The steps of a new workspace. The providers connect on Integrations; Start a project goes to
 * Projects until the Create project dialog lands.
 */
function GetStartedSection({ steps }: { steps: SetupStep[] }) {
  const goTo = useGoTo();
  return (
    <HomeSection title="Get started">
      {steps.map((step) => (
        <SetupRow
          key={step}
          icon={
            step === 'calendar' ? (
              <ProviderTile provider="google-calendar" />
            ) : step === 'linear' ? (
              <ProviderTile provider="linear" />
            ) : (
              Folder
            )
          }
          title={SETUP[step].title}
          description={SETUP[step].description}
          action={
            <Button
              size="sm"
              onClick={() => goTo(step === 'project' ? 'projects' : 'integrations')}
            >
              {step === 'project' ? 'Create' : 'Connect'}
            </Button>
          }
        />
      ))}
    </HomeSection>
  );
}
