import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import type { TaskListItem, TaskSummary } from '@common/types';
import {
  EditorTitle,
  Inert,
  PageContent,
  PageFavoriteButton,
  Stack,
  Page,
} from '@renderer/components';
import { ipc, trpc } from '@renderer/ipc';
import { NotFoundPage } from '@renderer/shared/components/NotFoundPage';
import { SectionPage } from '@renderer/shared/components/SectionPage';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { useHistoryPosition } from '@renderer/shared/hooks/use-history-position';
import { useRecordView } from '@renderer/shared/hooks/use-record-view';
import { useConfirmRestore } from '@renderer/shared/hooks/use-confirm-restore';
import { TrashedNotice } from '@renderer/shared/components/TrashedNotice';
import { ipcErrorCode } from '@renderer/shared/lib/workspace/errors';
import { isSynced } from '../api/queries';
import { useSheet } from '@renderer/shared/hooks/use-sheet';
import { taskRoute } from '../api/route-api';
import { TASK_PAGE_SHEET_KINDS } from '../api/search';
import { TaskDetailMenu } from '../components/detail/TaskDetailMenu';
import { TaskNoteSection } from '../components/sections/TaskNoteSection';
import { TaskDescription } from '../components/sections/TaskDescription';
import { TaskProperties, type AddingProperty } from '../components/detail/TaskProperties';
import { TaskSubtasksSection } from '../components/sections/TaskSubtasksSection';
import { useTaskActions } from '../hooks/use-task-actions';

/**
 * A task's page (`/app/$workspaceId/tasks/$taskId`, Figma `7158:6266` and its variants): the
 * title, the property rows, the description in the rich text editor (saved as you type), the
 * Subtasks and the task note (opening in the sheet beside the page, `?sheet=nte_…`); the star and
 * the "…" menu in the header. A synced task's fields are
 * its provider's, so they are read-only here; its links stay editable. The route's loader has the
 * task before the first frame; a task deleted while it is open shows not-found.
 */
export function TaskPage() {
  const { taskId } = taskRoute.useParams();
  const task = useQuery({
    ...trpc.tasks.get.queryOptions({ id: taskId }),
    // a task trashed or converted from this page is gone for good: retrying would hold up the
    // mutation that refetches it (and the page leaves it anyway)
    retry: (failures, error) => ipcErrorCode(error) !== 'not_found' && failures < 3,
  });
  useRecordView(taskId);
  if (task.data === undefined) {
    if (task.isError && ipcErrorCode(task.error) === 'not_found') return <NotFoundPage />;
    // not loaded yet (the loader normally has it): the section's crumb, so the header is there
    return <SectionPage title="Tasks" />;
  }
  // a new task, a fresh page: the title and description start from it
  return <TaskPageContent key={task.data.id} task={task.data} />;
}

function TaskPageContent({ task }: { task: TaskListItem }) {
  const { workspaceId } = taskRoute.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const { canGoBack } = useHistoryPosition();
  const actions = useTaskActions();
  const showError = useMutationErrorToast();
  const confirmRestore = useConfirmRestore();
  const [adding, setAdding] = useState<AddingProperty>(null);
  const synced = isSynced(task);
  // opened from Trash: shown as it is, read-only, until it's restored
  const trashed = task.archivedAt !== null;

  // the task note in the sheet beside the page (?sheet=nte_…)
  const search = taskRoute.useSearch();
  const sheet = useSheet({ id: search.sheet, kinds: TASK_PAGE_SHEET_KINDS });

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
    else navigate({ to: '/app/$workspaceId/tasks', params: { workspaceId }, replace: true });
  }

  return (
    <Page
      title={task.title}
      actions={
        !trashed && (
          <>
            <PageFavoriteButton
              favorite={task.favoritedAt !== null}
              onFavoriteChange={(favorite) => actions.setFavorite([task], favorite)}
            />
            <TaskDetailMenu task={task} onAdd={setAdding} onTrash={() => trash()} />
          </>
        )
      }
    >
      <PageContent layout="document" data-testid="task-page">
        <Stack gap="8">
          {trashed && (
            <TrashedNotice
              noun="task"
              // one sync moved to the trash comes back detached, after asking
              onRestore={() =>
                void confirmRestore([task]).then((ok) => {
                  if (!ok) return;
                  ipc.archive.restoreTask
                    .mutate({ id: task.id })
                    .catch((error: unknown) => showError(error, 'Couldn’t restore the task'));
                })
              }
            />
          )}
          {/* inert while trashed: shown, not editable; the notice above stays live */}
          <Inert when={trashed} render={<Stack gap="8" />} data-trashed={trashed ? '' : undefined}>
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
            <TaskNoteSection task={task} onOpenNote={sheet.show} />
          </Inert>
        </Stack>
      </PageContent>
      {sheet.render()}
    </Page>
  );
}
