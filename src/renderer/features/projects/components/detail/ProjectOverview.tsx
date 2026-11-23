import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Flag, Plus } from 'lucide-react';
import { TaskStatus, type Project, type ProjectStats } from '@common/types';
import {
  AddSlot,
  Button,
  Card,
  DetailSection,
  HomeCards,
  Icon,
  NoteCard,
  PageContent,
  percentOf,
  Stack,
  statusVar,
  StatusIcon,
  useFormat,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { entityLink } from '@renderer/shared/lib/entities';
import { useCreateNote } from '@renderer/features/notes/hooks/use-create-note';
import type { DueFilter, StatusFilter } from '@renderer/features/tasks/api/search';
import { isSynced } from '@renderer/features/tasks/api/queries';
import {
  overviewDoneTasksQuery,
  overviewNotesQuery,
  overviewOpenTasksQuery,
} from '../../api/queries';
import { projectRoute } from '../../api/route-api';
import { projectTime } from '../../lib/time-left';
import { OverviewTaskSection } from './OverviewTaskSection';
import styles from './ProjectPage.module.css';

type ShowTasks = (search: { status?: StatusFilter; due?: DueFilter; view?: 'list' }) => void;

/**
 * The Overview tab: the project as one document, in the column a task's and a note's pages use.
 * Its header, then where it stands at a glance (how much is done and how long is left, over a bar
 * split by status whose legend opens the Tasks tab on each status and on the overdue tasks), its
 * open tasks with an "Add task…" row, its latest notes as cards, and what was completed recently.
 */
export function ProjectOverview({ project, header }: { project: Project; header: ReactNode }) {
  const navigate = projectRoute.useNavigate();
  // a project in the trash has no active tasks to count (they went with it), and stats refuses it
  const stats = useQuery({
    ...trpc.projects.stats.queryOptions({ id: project.id }),
    enabled: project.archivedAt === null,
  }).data;
  const empty = stats !== undefined && stats.totalTasks + stats.numOfCancelled === 0;
  // the Tasks tab, filtered: where a section's "N more" and the legend go
  const showTasks: ShowTasks = (search) =>
    navigate({ search: { tab: 'tasks', ...search }, replace: true });

  return (
    <PageContent layout="document" data-testid="project-overview">
      <Stack gap="8">
        {header}
        <AtAGlance project={project} stats={stats} onShow={showTasks} />
        {stats && (
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
        )}
        <NotesSection
          project={project}
          onShowAll={() => navigate({ search: { tab: 'notes' }, replace: true })}
        />
        {stats !== undefined && stats.numOfCompleted > 0 && (
          <OverviewTaskSection
            project={project}
            title="Recently completed"
            query={overviewDoneTasksQuery(project.id)}
            count={stats.numOfCompleted}
            onShowAll={() => showTasks({ status: 'completed' })}
            data-testid="overview-done"
          />
        )}
      </Stack>
    </PageContent>
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
        navigate({
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
 * Where the project stands, as one card: two figures side by side (the percent with "N of M tasks
 * done", and how long is left with the day it is on), one bar split by status, and its legend, a
 * button per status and one for the overdue tasks. Each opens the Tasks tab on its tasks (the
 * overdue ones in the list view, where overdue subtasks show too; the board lists top-level
 * tasks). A figure with nothing to say is left out, and so is the card when neither has.
 */
function AtAGlance({
  project,
  stats,
  onShow,
}: {
  project: Project;
  stats: ProjectStats | undefined;
  onShow: ShowTasks;
}) {
  const { now, formatDate } = useFormat();
  const time = projectTime(project, now, formatDate);
  const total = stats?.totalTasks ?? 0;
  const counted = stats !== undefined && total > 0;
  if (!counted && !time) return null;
  return (
    <Card className={styles.glance} render={<section aria-label="Project at a glance" />}>
      <div className={styles.figures}>
        {counted && (
          <Figure
            label="Progress"
            value={
              <>
                {percentOf(stats.numOfCompleted, total)}
                <span className={styles.unit}>%</span>
              </>
            }
            detail={`${stats.numOfCompleted} of ${total} tasks done`}
          />
        )}
        {time && (
          <Figure
            label={time.tone === 'done' ? 'Finished' : 'Time left'}
            value={time.headline}
            detail={time.detail}
            tone={time.tone}
          />
        )}
      </div>
      {counted && (
        <>
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
                <button type="button" onClick={() => onShow({ status: segment.filter })}>
                  <StatusIcon status={segment.status} size={12} />
                  <span>{segment.label}</span>
                  <span className={styles.legendCount}>{stats[segment.key]}</span>
                </button>
              </li>
            ))}
            {stats.numOfOverdue > 0 && (
              <li className={styles.legendEnd}>
                <button
                  type="button"
                  data-tone="overdue"
                  onClick={() => onShow({ due: 'overdue', view: 'list' })}
                >
                  <Icon icon={Flag} size={12} />
                  <span>{stats.numOfOverdue} overdue</span>
                </button>
              </li>
            )}
          </ul>
        </>
      )}
    </Card>
  );
}

/** One of the card's figures: a 12px label over the value, with a quiet detail after it. */
function Figure({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: string;
}) {
  return (
    <div className={styles.figure}>
      <span className={styles.figureLabel}>{label}</span>
      <span className={styles.figureLine}>
        <span className={styles.figureValue} data-tone={tone}>
          {value}
        </span>
        {detail != null && <span className={styles.quiet}>{detail}</span>}
      </span>
    </div>
  );
}

/**
 * The latest notes as three small cards (Home's), each opening its note, with "All notes" for the
 * Notes tab and "+" for a new one; with none yet, a dashed "Add a note" slot, as a task's note has.
 */
function NotesSection({ project, onShowAll }: { project: Project; onShowAll: () => void }) {
  const { workspaceId } = projectRoute.useParams();
  const createNote = useCreateNote();
  const query = useQuery({
    ...overviewNotesQuery(project.id),
    enabled: project.archivedAt === null,
  });
  const notes = query.data?.items ?? [];
  const newNote = () => createNote({ projectId: project.id });
  if (query.data === undefined) return null;
  return (
    <DetailSection
      spacing="page"
      title="Notes"
      data-testid="overview-notes"
      action={
        notes.length > 0 && (
          <>
            <button type="button" className={styles.sectionLink} onClick={onShowAll}>
              All notes
              <Icon icon={ArrowRight} size={12} />
            </button>
            <Button
              size="icon-xs"
              variant="ghost"
              icon={Plus}
              aria-label="New note"
              onClick={newNote}
            />
          </>
        )
      }
    >
      {notes.length === 0 ? (
        <AddSlot size="lg" onClick={newNote}>
          Add a note
        </AddSlot>
      ) : (
        <HomeCards>
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              size="sm"
              note={{ ...note, project: null, link: null }}
              render={<Link {...entityLink(workspaceId, { id: note.id })!} />}
            />
          ))}
        </HomeCards>
      )}
    </DetailSection>
  );
}
