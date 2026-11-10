import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { ArrowRight, Calendar, CircleCheck, FileText, Flag, Folder, Plus } from 'lucide-react';
import { ProjectStatus, TaskStatus, type Project, type ProjectStats } from '@common/types';
import {
  Button,
  Card,
  EmptyState,
  Flex,
  Icon,
  percentOf,
  statusVar,
  StatusIcon,
  useFormat,
} from '../../../components';
import { trpc } from '../../../ipc';
import { useOpenEntity } from '../../app/use-open-entity';
import { useCreateTask } from '../../tasks/create/use-create-task';
import type { StatusFilter } from '../../tasks/search';
import { overviewDoneTasksQuery, overviewNotesQuery, overviewOpenTasksQuery } from '../queries';
import { projectRoute } from '../route-api';
import { OverviewTaskSection } from './OverviewTaskSection';
import styles from './ProjectPage.module.css';

/**
 * The Overview tab, in two columns that scroll together: on the left the header (name,
 * properties, description) over the work, Open tasks (the soonest due first) and Recently
 * completed, each a few rows with "N more in Tasks"; on the right a rail with the project at a
 * glance: Progress (done of total, a bar split by status, and what's overdue), Timeline (start,
 * due, and how long is left) and its latest notes. In a narrow window the rail goes under.
 */
export function ProjectOverview({ project, header }: { project: Project; header: ReactNode }) {
  const navigate = projectRoute.useNavigate();
  const stats = useQuery(trpc.projects.stats.queryOptions({ id: project.id })).data;
  const empty = stats !== undefined && stats.totalTasks + stats.numOfCancelled === 0;
  // the Tasks tab, filtered: where a section's "N more" goes
  const showTasks = (status: StatusFilter) =>
    void navigate({ search: { tab: 'tasks', status }, replace: true });

  return (
    <div className={styles.overview} data-testid="project-overview">
      <div className={styles.layout}>
        <div className={styles.main}>
          {header}
          {empty ? (
            <ProjectNoTasks project={project} />
          ) : (
            stats && (
              <>
                <OverviewTaskSection
                  project={project}
                  title="Open tasks"
                  query={overviewOpenTasksQuery(project.id)}
                  count={stats.numOfNotStarted + stats.numOfInProgress}
                  addStatus={TaskStatus.NOT_STARTED}
                  empty="Every task is done."
                  onShowAll={() => showTasks('open')}
                  data-testid="overview-open"
                />
                {stats.numOfCompleted > 0 && (
                  <OverviewTaskSection
                    project={project}
                    title="Recently completed"
                    query={overviewDoneTasksQuery(project.id)}
                    count={stats.numOfCompleted}
                    onShowAll={() => showTasks('completed')}
                    data-testid="overview-done"
                  />
                )}
              </>
            )
          )}
        </div>
        <aside className={styles.rail} aria-label="Project at a glance">
          {stats && !empty && (
            <ProgressCard
              stats={stats}
              onShowOverdue={() =>
                void navigate({ search: { tab: 'tasks', due: 'overdue' }, replace: true })
              }
            />
          )}
          <TimelineCard project={project} />
          <NotesCard
            project={project}
            onShowAll={() => void navigate({ search: { tab: 'notes' }, replace: true })}
          />
        </aside>
      </div>
    </div>
  );
}

function RailCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className={styles.railCard} render={<section aria-label={title} />}>
      <header className={styles.railHead}>
        <h2 className={styles.railTitle}>{title}</h2>
        {action}
      </header>
      {children}
    </Card>
  );
}

const SEGMENTS = [
  { status: TaskStatus.COMPLETED, label: 'Completed', key: 'numOfCompleted' },
  { status: TaskStatus.IN_PROGRESS, label: 'In progress', key: 'numOfInProgress' },
  { status: TaskStatus.NOT_STARTED, label: 'Not started', key: 'numOfNotStarted' },
] as const;

/** Done of total in large, one bar split by status, its legend, and the overdue tasks. */
function ProgressCard({
  stats,
  onShowOverdue,
}: {
  stats: ProjectStats;
  onShowOverdue: () => void;
}) {
  const total = stats.totalTasks;
  return (
    <RailCard title="Progress">
      <div className={styles.progressFigure}>
        <span className={styles.percent}>
          {percentOf(stats.numOfCompleted, total)}
          <span className={styles.percentSign}>%</span>
        </span>
        <span className={styles.quiet}>
          {stats.numOfCompleted} of {total} tasks done
        </span>
      </div>
      <div
        className={styles.bar}
        role="img"
        aria-label={SEGMENTS.map((s) => `${stats[s.key]} ${s.label.toLowerCase()}`).join(', ')}
      >
        {SEGMENTS.map(
          (segment) =>
            stats[segment.key] > 0 && (
              <span
                key={segment.status}
                style={
                  {
                    flexGrow: stats[segment.key],
                    '--segment': statusVar(segment.status),
                  } as CSSProperties
                }
              />
            ),
        )}
      </div>
      <ul className={styles.legend}>
        {SEGMENTS.map((segment) => (
          <li key={segment.status}>
            <StatusIcon status={segment.status} size={12} />
            <span>{segment.label}</span>
            <span className={styles.legendCount}>{stats[segment.key]}</span>
          </li>
        ))}
      </ul>
      {stats.numOfOverdue > 0 && (
        <button type="button" className={styles.overdue} onClick={onShowOverdue}>
          <Icon icon={Flag} size={12} />
          {stats.numOfOverdue} overdue
          <Icon icon={ArrowRight} size={12} className={styles.pushRight} />
        </button>
      )}
    </RailCard>
  );
}

/** Start and due dates, and how long is left (or how late it is), in whole days. */
function TimelineCard({ project }: { project: Project }) {
  const { now, formatDate } = useFormat();
  const { startDate, dueDate, status } = project;
  const done = status === ProjectStatus.COMPLETED;
  const today = DateTime.fromJSDate(now).startOf('day');
  const daysLeft = dueDate
    ? Math.round(DateTime.fromJSDate(dueDate).startOf('day').diff(today, 'days').days)
    : null;
  const left =
    done && project.completedAt
      ? `Done ${formatDate(project.completedAt)}`
      : daysLeft === null
        ? 'No due date'
        : daysLeft > 1
          ? `${daysLeft} days left`
          : daysLeft === 1
            ? 'Due tomorrow'
            : daysLeft === 0
              ? 'Due today'
              : `${-daysLeft} ${daysLeft === -1 ? 'day' : 'days'} overdue`;
  const late = !done && daysLeft !== null && daysLeft < 0;
  // how far through its dates the project is, when it has both
  const elapsed =
    startDate && dueDate && dueDate > startDate
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((now.getTime() - startDate.getTime()) / (dueDate.getTime() - startDate.getTime())) *
                100,
            ),
          ),
        )
      : null;
  return (
    <RailCard title="Timeline">
      <dl className={styles.dates}>
        <div>
          <dt>Start</dt>
          <dd>{startDate ? formatDate(startDate) : '—'}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{dueDate ? formatDate(dueDate) : '—'}</dd>
        </div>
      </dl>
      {elapsed !== null && !done && (
        <div className={styles.track} aria-hidden>
          <span style={{ width: `${elapsed}%` }} data-late={late ? '' : undefined} />
        </div>
      )}
      <p className={styles.left} data-late={late ? '' : undefined}>
        <Icon icon={done ? CircleCheck : Calendar} size={12} />
        {left}
      </p>
    </RailCard>
  );
}

/** The latest notes as a short list of titles and when they were edited, with "All notes". */
function NotesCard({ project, onShowAll }: { project: Project; onShowAll: () => void }) {
  const openEntity = useOpenEntity();
  const { formatRelative } = useFormat('minute');
  const notes = useQuery(overviewNotesQuery(project.id)).data?.items ?? [];
  return (
    <RailCard
      title="Notes"
      action={
        notes.length > 0 && (
          <button type="button" className={styles.railLink} onClick={onShowAll}>
            All notes
            <Icon icon={ArrowRight} size={12} />
          </button>
        )
      }
    >
      {notes.length === 0 ? (
        <p className={styles.quiet}>No notes in this project yet.</p>
      ) : (
        <ul className={styles.notes}>
          {notes.map((note) => (
            <li key={note.id}>
              <button type="button" onClick={() => openEntity({ id: note.id })}>
                <Icon icon={FileText} size={14} />
                <span className={styles.noteTitle}>{note.title || 'Untitled'}</span>
                <span className={styles.noteTime}>{formatRelative(note.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}

function ProjectNoTasks({ project }: { project: Project }) {
  const { workspaceId } = projectRoute.useParams();
  const createTask = useCreateTask();
  const navigate = useNavigate();
  return (
    <EmptyState
      placement="inline"
      icon={Folder}
      title="No tasks in this project yet"
      description="Add tasks here, or move existing ones in from the Tasks list."
      data-testid="project-no-tasks"
      action={
        <Flex gap="2" justify="center">
          <Button
            size="sm"
            icon={Plus}
            onClick={() => createTask({ defaults: { projectId: project.id } })}
          >
            New Task
          </Button>
          <Button
            size="sm"
            variant="ghost"
            // the tasks in no project, to move in from their menus
            onClick={() =>
              void navigate({
                to: '/app/$workspaceId/tasks',
                params: { workspaceId },
                search: { project: 'none' },
              })
            }
          >
            Move Tasks Here
          </Button>
        </Flex>
      }
    />
  );
}
