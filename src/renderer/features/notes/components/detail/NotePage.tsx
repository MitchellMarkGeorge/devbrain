import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import type { Editor } from '@tiptap/react';
import { FileText } from 'lucide-react';
import type { TaskId } from '@common/ids';
import type { Note } from '@common/types';
import {
  Breadcrumb,
  EditorTitle,
  PageContent,
  PageFavoriteButton,
  Text,
  useFormat,
} from '@renderer/components';
import { ipc, trpc } from '@renderer/ipc';
import { NotFoundPage } from '@renderer/shared/components/NotFoundPage';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { PageHeaderSlot, useCrumbLink } from '@renderer/layouts/workspace/page-header';
import { useHistoryPosition } from '@renderer/shared/hooks/use-history-position';
import { useRecordView } from '@renderer/shared/hooks/use-record-view';
import { ipcErrorCode } from '@renderer/shared/lib/workspace/errors';
import { useCreateTask } from '@renderer/features/tasks/hooks/use-create-task';
import { TaskSheet } from '@renderer/features/tasks/components/sheet/TaskSheet';
import { noteRoute } from '../../api/route-api';
import { useNoteActions } from '../../hooks/use-note-actions';
import { NoteDetailMenu } from './NoteDetailMenu';
import { NoteEditor } from './NoteEditor';
import { NotePills } from './NotePills';
import { NoteTasksSection } from './NoteTasksSection';
import styles from './NotePage.module.css';

/**
 * A note's page (`/app/$workspaceId/notes/$noteId`, Figma `7158:16387`, `7158:16863`): the title
 * (renamed as it's left), "Edited …", the pills (project, link, tasks), the body in the rich text
 * editor (saved as you type), then the Tasks made from it (each opening in the task sheet beside
 * the page, `?open=tsk_…`); the star and the "…" menu in the header. The route's loader has the
 * note and its markdown before the first frame; a note deleted while it is open shows not-found.
 */
export function NotePage() {
  const { noteId } = noteRoute.useParams();
  const note = useQuery(trpc.notes.get.queryOptions({ id: noteId }));
  useRecordView(noteId);
  if (note.data === undefined || note.data.archivedAt !== null) {
    const gone =
      (note.isError && ipcErrorCode(note.error) === 'not_found') || note.data?.archivedAt;
    return gone ? <NotFoundPage /> : null;
  }
  // a new note, a fresh page: the title and body start from it
  return <NotePageContent key={note.data.id} note={note.data} />;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function NotePageContent({ note }: { note: Note }) {
  const { workspaceId } = noteRoute.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const { canGoBack } = useHistoryPosition();
  const crumbLink = useCrumbLink();
  const actions = useNoteActions();
  const createTask = useCreateTask();
  const showError = useMutationErrorToast();
  const { formatRelative } = useFormat('minute');
  const title = useRef<HTMLHeadingElement>(null);

  // a task made from the note, in the sheet beside the page (?open=tsk_…), with an entry of its
  // own, so Back closes it; it stays mounted once `open` leaves the URL, until it has slid out
  const { open } = noteRoute.useSearch();
  const navigateHere = noteRoute.useNavigate();
  const [sheetTask, setSheetTask] = useState(open);
  if (open && open !== sheetTask) setSheetTask(open);
  const openTask = (id: TaskId) =>
    void navigateHere({
      search: (previous) => ({ ...previous, open: id }),
      state: (previous) => ({ ...previous, openedSheet: true }),
    });
  const editor = useRef<Editor | null>(null);

  // a note just created opens with its empty title focused, to name it
  const isNew = useRouterState({ select: (state) => state.location.state.newNote === true });
  useEffect(() => {
    if (isNew) title.current?.focus();
  }, [isNew]);

  function saveTitle(event: FocusEvent<HTMLHeadingElement>) {
    const next = (event.currentTarget.textContent ?? '').trim();
    if (next !== note.title) actions.rename(note, next);
  }

  function onTitleKey(event: KeyboardEvent<HTMLHeadingElement>) {
    if (event.key === 'Enter') {
      // on to the body, as a document's title does
      event.preventDefault();
      event.currentTarget.blur();
      editor.current?.commands.focus('start');
    } else if (event.key === 'Escape') {
      event.currentTarget.textContent = note.title;
      event.currentTarget.blur();
    }
  }

  async function trash() {
    if (!(await actions.trash([note]))) return;
    if (canGoBack) router.history.back();
    else void navigate({ to: '/app/$workspaceId/notes', params: { workspaceId }, replace: true });
  }

  const newTask = () => createTask({ defaults: { linkedNoteId: note.id } });
  const linkTask = (id: TaskId) =>
    void ipc.tasks.updateLinks
      .mutate({ id, linkedNoteId: note.id })
      .catch((error: unknown) => showError(error, 'Couldn’t link the task'));

  return (
    <>
      <PageHeaderSlot
        place={
          <Breadcrumb
            items={[
              crumbLink('Notes', { to: '/app/$workspaceId/notes', params: { workspaceId } }),
              { label: note.title || 'Untitled', icon: FileText },
            ]}
          />
        }
        actions={
          <>
            <PageFavoriteButton
              favorite={note.favoritedAt !== null}
              onFavoriteChange={(favorite) => actions.setFavorite([note], favorite)}
            />
            <NoteDetailMenu note={note} actions={actions} onTrash={() => void trash()} />
          </>
        }
      />
      <PageContent layout="document" data-testid="note-page">
        <div className={styles.head}>
          <EditorTitle
            // keyed on the title, so a rename elsewhere shows here
            key={note.title}
            ref={title}
            placeholder="Untitled"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            aria-label="Title"
            onBlur={saveTitle}
            onKeyDown={onTitleKey}
          >
            {note.title}
          </EditorTitle>
          <Text size="xs" tone="subtle" className={styles.edited}>
            Edited {lowerFirst(formatRelative(note.updatedAt))}
          </Text>
          <div className={styles.pills}>
            <NotePills note={note} actions={actions} onNewTask={newTask} onLinkTask={linkTask} />
          </div>
        </div>
        <div className={styles.body}>
          <NoteEditor
            key={note.id}
            noteId={note.id}
            onReady={(ready) => {
              editor.current = ready;
            }}
          />
        </div>
        <NoteTasksSection
          noteId={note.id}
          onNewTask={newTask}
          onLinkTask={linkTask}
          onOpenTask={openTask}
        />
      </PageContent>
      {sheetTask && (
        <TaskSheet
          taskId={sheetTask}
          open={open !== undefined}
          onClose={() =>
            void navigateHere({ search: (previous) => ({ ...previous, open: undefined }) })
          }
          onClosed={() => setSheetTask(undefined)}
        />
      )}
    </>
  );
}
