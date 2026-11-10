import type { ReactNode } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Folder, Plus } from 'lucide-react';
import type { Project } from '@common/types';
import { Button, EmptyState, Flex, PageContent } from '../../../components';
import { trpc } from '../../../ipc';
import { useCreateTask } from '../../tasks/create/use-create-task';
import { TasksGroups } from '../../tasks/views/group/TasksGroups';
import { resolveTasksSearch } from '../../tasks/search';
import { overviewSearch } from '../loaders';
import { projectRoute } from '../route-api';
import styles from './ProjectPage.module.css';

/**
 * The Overview tab (Figma `7159:12540`): the header over the project's tasks grouped by status
 * (each group collapsible, with "+ Add task" in the project), or with no tasks yet "No tasks in
 * this project yet" (`7424:41240`), offering New Task and the Tasks list's tasks in no project.
 */
export function ProjectOverview({ project, header }: { project: Project; header: ReactNode }) {
  const stats = useQuery(trpc.projects.stats.queryOptions({ id: project.id })).data;
  const empty = stats !== undefined && stats.totalTasks + stats.numOfCancelled === 0;
  // every task of the project, grouped by status, as the loader primed them
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const resolved = resolveTasksSearch(overviewSearch(project.id), settings);
  return (
    <PageContent layout="list" className={styles.overview} data-testid="project-overview">
      <div className={styles.header}>{header}</div>
      {empty ? (
        <ProjectNoTasks project={project} />
      ) : (
        <div className={styles.groups}>
          <TasksGroups resolved={resolved} search={{}} onClearFilters={() => {}} />
        </div>
      )}
    </PageContent>
  );
}

function ProjectNoTasks({ project }: { project: Project }) {
  const { workspaceId } = projectRoute.useParams();
  const createTask = useCreateTask();
  const navigate = useNavigate();
  return (
    <div className={styles.noTasks}>
      <EmptyState
        placement="inline"
        icon={Folder}
        title="No tasks in this project yet"
        description="Add tasks here, or move existing ones in from the Tasks list."
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
    </div>
  );
}
