import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, FileText, Flag, Plus } from 'lucide-react';
import { TaskStatus, type Project, type ProjectStats } from '@common/types';
import { Button, Icon, percentOf, statusVar, StatusIcon, useFormat } from '../../../components';
import { trpc } from '../../../ipc';
import { useOpenEntity } from '../../app/use-open-entity';
import { useCreateNote } from '../../notes/use-create-note';
import type { DueFilter, StatusFilter } from '../../tasks/search';
import { isSynced } from '../../tasks/queries';
import { overviewDoneTasksQuery, overviewNotesQuery, overviewOpenTasksQuery } from '../queries';
import { projectRoute } from '../route-api';
import { OverviewTaskSection } from './OverviewTaskSection';
import styles from './ProjectPage.module.css';

/**
 * The Overview tab, laid out as Linear's project page: the project as a document on the left (its
 * header, then its open tasks with an "Add task…" row, and the recently completed ones), and a
 * flat rail on the right, its sections split by hairlines: Progress (the percent, a bar split by
 * status, and a row per status and for the overdue tasks, each opening the Tasks tab on them) and
 * the latest notes. The two scroll together; in a narrow window the rail goes under.
 */
export function ProjectOverview({ project, header }: { project: Project; header: ReactNode }) {
  const navigate = projectRoute.useNavigate();
  const stats = useQuery(trpc.projects.stats.queryOptions({ id: project.id })).data;
  const empty = stats !== undefined && stats.totalTasks + stats.numOfCancelled === 0;
  // the Tasks tab, filtered: where a section's "N more" and the progress rows go
  const showTasks = (search: { status?: StatusFilter; due?: DueFilter; view?: 'list' }) =>
    void navigate({ search: { tab: 'tasks', ...search }, replace: true });

  return (
    <div className={styles.overview} data-testid="project-overview">
      <div className={styles.layout}>
        <div className={styles.main}>
          {header}
          {stats && (
            <>
              <OverviewTaskSection
                project={project}
                title="Open tasks"
                query={overviewOpenTasksQuery(project.id)}
                count={stats.numOfNotStarted + stats.numOfInProgress}
                addStatus={TaskStatus.NOT_STARTED}
                empty={empty ? 'No tasks in this project yet.' : 'Every task is done.'}
                footer={empty && !isSynced(project) && <MoveTasksHere />}
                onShowAll={() => showTasks({ status: 'open' })}
                data-testid={empty ? 'project-no-tasks' : 'overview-open'}
              />
              {stats.numOfCompleted > 0 && (
                <OverviewTaskSection
                  project={project}
                  title="Recently completed"
                  query={overviewDoneTasksQuery(project.id)}
                  count={stats.numOfCompleted}
                  onShowAll={() => showTasks({ status: 'completed' })}
                  data-testid="overview-done"
                />
              )}
            </>
          )}
        </div>
        <aside className={styles.rail} aria-label="Project at a glance">
          <ProgressSection stats={stats} onShow={showTasks} />
          <NotesSection
            project={project}
            onShowAll={() => void navigate({ search: { tab: 'notes' }, replace: true })}
          />
        </aside>
      </div>
    </div>
  );
}

/** "Move Tasks Here": the tasks in no project, to move in from their menus. */
function MoveTasksHere() {
  const { workspaceId } = projectRoute.useParams();
  const navigate = useNavigate();
  return (
    <Button
      size="xs"
      variant="ghost"
      className={styles.moveHere}
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
  );
}

function RailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.railSection} aria-label={title}>
      <header className={styles.railHead}>
        <h2 className={styles.railTitle}>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

const SEGMENTS = [
  { status: TaskStatus.COMPLETED, label: 'Completed', key: 'numOfCompleted', filter: 'completed' },
  {
    status: TaskStatus.IN_PROGRESS,
    label: 'In progress',
    key: 'numOfInProgress',
    filter: 'in_progress',
  },
  {
    status: TaskStatus.NOT_STARTED,
    label: 'Not started',
    key: 'numOfNotStarted',
    filter: 'not_started',
  },
] as const satisfies readonly {
  status: TaskStatus;
  label: string;
  key: keyof ProjectStats;
  filter: StatusFilter;
}[];

/**
 * The percent large with "N of M tasks done", one bar split by status, then a row per status and
 * one for the overdue tasks: each opens the Tasks tab on its tasks (the overdue ones in the list
 * view, where overdue subtasks show too; the board lists top-level tasks).
 */
function ProgressSection({
  stats,
  onShow,
}: {
  stats: ProjectStats | undefined;
  onShow: (search: { status?: StatusFilter; due?: DueFilter; view?: 'list' }) => void;
}) {
  const total = stats?.totalTasks ?? 0;
  return (
    <RailSection title="Progress">
      {!stats ? null : total === 0 ? (
        <p className={styles.quiet}>No tasks yet.</p>
      ) : (
        <>
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
          <ul className={styles.statRows}>
            {SEGMENTS.map((segment) => (
              <li key={segment.status}>
                <button type="button" onClick={() => onShow({ status: segment.filter })}>
                  <StatusIcon status={segment.status} size={12} />
                  <span>{segment.label}</span>
                  <span className={styles.statCount}>{stats[segment.key]}</span>
                </button>
              </li>
            ))}
            {stats.numOfOverdue > 0 && (
              <li>
                <button
                  type="button"
                  data-tone="overdue"
                  onClick={() => onShow({ due: 'overdue', view: 'list' })}
                >
                  <Icon icon={Flag} size={12} />
                  <span>{stats.numOfOverdue} overdue</span>
                  <Icon icon={ArrowRight} size={12} className={styles.statCount} />
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </RailSection>
  );
}

/** The latest notes as a short list of titles and when they were edited, "+" for a new one. */
function NotesSection({ project, onShowAll }: { project: Project; onShowAll: () => void }) {
  const openEntity = useOpenEntity();
  const createNote = useCreateNote();
  const { formatRelative } = useFormat('minute');
  const notes = useQuery(overviewNotesQuery(project.id)).data?.items ?? [];
  return (
    <RailSection
      title="Notes"
      action={
        <Button
          size="icon-xs"
          variant="ghost"
          icon={Plus}
          aria-label="New note"
          onClick={() => void createNote({ projectId: project.id })}
        />
      }
    >
      {notes.length === 0 ? (
        <p className={styles.quiet}>No notes in this project yet.</p>
      ) : (
        <>
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
          <button type="button" className={styles.railLink} onClick={onShowAll}>
            All notes
            <Icon icon={ArrowRight} size={12} />
          </button>
        </>
      )}
    </RailSection>
  );
}
