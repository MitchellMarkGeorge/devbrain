import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import type { Task, TaskSummary } from '@common/types';
import {
  Breadcrumb,
  EditorTitle,
  PageContent,
  PageFavoriteButton,
  Stack,
  StatusIcon,
} from '../../../components';
import { ipc, trpc } from '../../../ipc';
import { NotFoundPage } from '../../app/NotFoundPage';
import { useMutationErrorToast } from '../../app/mutation-errors';
import { PageHeaderSlot, useCrumbLink } from '../../app/page-header';
import { useHistoryPosition } from '../../app/use-history-position';
import { useRecordView } from '../../app/use-record-view';
import { ipcErrorCode } from '../../../workspace/errors';
import { isSynced } from '../queries';
import { taskRoute } from '../route-api';
import { TaskDetailMenu } from './TaskDetailMenu';
import { TaskNoteSection } from '../sections/TaskNoteSection';
import { TaskDescription } from '../sections/TaskDescription';
import { TaskProperties, type AddingProperty } from './TaskProperties';
import { TaskSubtasksSection } from '../sections/TaskSubtasksSection';
import { useTaskActions } from '../use-task-actions';

/**
 * A task's page (`/app/$workspaceId/tasks/$taskId`, Figma `7158:6266` and its variants): the
 * title, the property rows, the description in the rich text editor (saved as you type), the
 * Subtasks and the task note; the star and the "…" menu in the header. A synced task's fields are
 * its provider's, so they are read-only here; its links stay editable. The route's loader has the
 * task before the first frame; a task deleted while it is open shows not-found.
 */
export function TaskPage() {
  const { taskId } = taskRoute.useParams();
  const task = useQuery(trpc.tasks.get.queryOptions({ id: taskId }));
  useRecordView(taskId);
  if (task.data === undefined) {
    return task.isError && ipcErrorCode(task.error) === 'not_found' ? <NotFoundPage /> : null;
  }
  // a new task, a fresh page: the title and description start from it
  return <TaskPageContent key={task.data.id} task={task.data} />;
}

function TaskPageContent({ task }: { task: Task }) {
  const { workspaceId } = taskRoute.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const { canGoBack } = useHistoryPosition();
  const crumbLink = useCrumbLink();
  const actions = useTaskActions();
  const showError = useMutationErrorToast();
  const [adding, setAdding] = useState<AddingProperty>(null);
  const synced = isSynced(task);

  const parentQuery = useQuery({
    ...trpc.tasks.get.queryOptions({ id: task.parentTaskId! }),
    enabled: task.parentTaskId !== null,
  });
  const parent: TaskSummary | null = parentQuery.data
    ? { id: parentQuery.data.id, title: parentQuery.data.title, status: parentQuery.data.status }
    : null;

  function saveTitle(event: FocusEvent<HTMLHeadingElement>) {
    const title = (event.currentTarget.textContent ?? '').trim();
    if (title === task.title) return;
    if (title === '') {
      event.currentTarget.textContent = task.title;
      return;
    }
    ipc.tasks.update
      .mutate({ id: task.id, title })
      .catch((error: unknown) => showError(error, 'Couldn’t rename the task'));
  }

  function onTitleKey(event: KeyboardEvent<HTMLHeadingElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.currentTarget.textContent = task.title;
      event.currentTarget.blur();
    }
  }

  async function trash() {
    if (!(await actions.trash([task]))) return;
    if (canGoBack) router.history.back();
    else void navigate({ to: '/app/$workspaceId/tasks', params: { workspaceId }, replace: true });
  }

  return (
    <>
      <PageHeaderSlot
        place={
          <Breadcrumb
            items={[
              crumbLink('Tasks', { to: '/app/$workspaceId/tasks', params: { workspaceId } }),
              { label: task.title, icon: <StatusIcon status={task.status} /> },
            ]}
          />
        }
        actions={
          <>
            <PageFavoriteButton
              favorite={task.favoritedAt !== null}
              onFavoriteChange={(favorite) => actions.setFavorite([task], favorite)}
            />
            <TaskDetailMenu task={task} onAdd={setAdding} onTrash={() => void trash()} />
          </>
        }
      />
      <PageContent layout="document" data-testid="task-page">
        <Stack gap="8">
          <EditorTitle
            // keyed on the title, so a rename elsewhere (or a sync) shows here
            key={task.title}
            placeholder="Task title"
            contentEditable={!synced}
            suppressContentEditableWarning
            spellCheck={false}
            aria-label="Title"
            onBlur={saveTitle}
            onKeyDown={onTitleKey}
          >
            {task.title}
          </EditorTitle>
          <TaskProperties
            task={task}
            parent={parent}
            actions={actions}
            adding={adding}
            onAddingChange={setAdding}
          />
          <TaskDescription task={task} />
          <TaskSubtasksSection task={task} />
          <TaskNoteSection task={task} />
        </Stack>
      </PageContent>
    </>
  );
}
