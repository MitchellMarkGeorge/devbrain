import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Folder, Plus } from 'lucide-react';
import { TaskStatus, type Project } from '@common/types';
import {
  Button,
  DetailSection,
  EmptyState,
  Flex,
  HomeCards,
  NoteCard,
  PageContent,
  Stack,
} from '../../../components';
import { trpc } from '../../../ipc';
import { useOpenEntity } from '../../app/use-open-entity';
import { useCreateTask } from '../../tasks/create/use-create-task';
import type { StatusFilter } from '../../tasks/search';
import { overviewNotesQuery } from '../queries';
import { projectRoute } from '../route-api';
import { OverviewTaskSection } from './OverviewTaskSection';

const STATUS_PARAM: Record<
  TaskStatus.IN_PROGRESS | TaskStatus.NOT_STARTED | TaskStatus.COMPLETED,
  StatusFilter
> = {
  [TaskStatus.IN_PROGRESS]: 'in_progress',
  [TaskStatus.NOT_STARTED]: 'not_started',
  [TaskStatus.COMPLETED]: 'completed',
};

/**
 * The Overview tab: one document column, scrolling as a whole, as a task's page does. The header
 * (name, properties, description), then the work: In progress, Up next (not started, the soonest
 * due first) and Completed (folded), each a few rows with "N more in Tasks", and the project's
 * latest notes. A project with no tasks shows "No tasks in this project yet" in their place.
 */
export function ProjectOverview({ project, header }: { project: Project; header: ReactNode }) {
  const navigate = projectRoute.useNavigate();
  const stats = useQuery(trpc.projects.stats.queryOptions({ id: project.id })).data;
  const empty = stats !== undefined && stats.totalTasks + stats.numOfCancelled === 0;
  // the Tasks tab, filtered to one status: where a section's "N more" goes
  const showAll = (status: keyof typeof STATUS_PARAM) =>
    void navigate({ search: { tab: 'tasks', status: STATUS_PARAM[status] }, replace: true });

  return (
    <PageContent layout="document" data-testid="project-overview">
      <Stack gap="8">
        {header}
        {empty ? (
          <ProjectNoTasks project={project} />
        ) : (
          stats && (
            <Stack gap="8">
              {stats.numOfInProgress > 0 && (
                <OverviewTaskSection
                  project={project}
                  status={TaskStatus.IN_PROGRESS}
                  title="In progress"
                  count={stats.numOfInProgress}
                  onShowAll={() => showAll(TaskStatus.IN_PROGRESS)}
                />
              )}
              <OverviewTaskSection
                project={project}
                status={TaskStatus.NOT_STARTED}
                title="Up next"
                count={stats.numOfNotStarted}
                onShowAll={() => showAll(TaskStatus.NOT_STARTED)}
              />
              {stats.numOfCompleted > 0 && (
                <OverviewTaskSection
                  project={project}
                  status={TaskStatus.COMPLETED}
                  title="Completed"
                  count={stats.numOfCompleted}
                  collapsed
                  onShowAll={() => showAll(TaskStatus.COMPLETED)}
                />
              )}
            </Stack>
          )
        )}
        <OverviewNotes
          project={project}
          onShowAll={() => void navigate({ search: { tab: 'notes' }, replace: true })}
        />
      </Stack>
    </PageContent>
  );
}

/** The project's three latest notes as small cards, with "All notes"; left out with none. */
function OverviewNotes({ project, onShowAll }: { project: Project; onShowAll: () => void }) {
  const openEntity = useOpenEntity();
  const notes = useQuery(overviewNotesQuery(project.id)).data?.items ?? [];
  if (notes.length === 0) return null;
  return (
    <DetailSection
      spacing="page"
      title="Latest notes"
      action={
        <Button size="xs" variant="ghost" icon={ArrowRight} onClick={onShowAll}>
          All notes
        </Button>
      }
    >
      <HomeCards>
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            size="sm"
            role="link"
            aria-label={note.title || 'Untitled'}
            onClick={() => openEntity({ id: note.id })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') openEntity({ id: note.id });
            }}
          />
        ))}
      </HomeCards>
    </DetailSection>
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
