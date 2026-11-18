import { useQuery } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import type { NoteId } from '@common/ids';
import { ipc, trpc } from '@renderer/ipc';
import { WorkspaceRichTextEditor } from '@renderer/shared/components/WorkspaceRichTextEditor';
import { useEditorAutosave } from '@renderer/shared/hooks/use-autosave';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';

/**
 * A note's body in the rich text editor: its markdown from `notes.readContent` (primed by the
 * route's loader), saved through `notes.updateContent` 500ms after typing stops, and at once on
 * leaving the page, on the window losing focus and on a workspace switch. The save's own refetch
 * never replaces what was typed after it; a change from elsewhere (the file edited on disk) does.
 * Key it by the note's id, so a save still pending goes to the note it was typed for. Not
 * `editable`, it only shows the note (one in the trash).
 */
export function NoteEditor({
  noteId,
  onReady,
  editable = true,
}: {
  noteId: NoteId;
  onReady?: (editor: Editor) => void;
  editable?: boolean;
}) {
  const content = useQuery(trpc.notes.readContent.queryOptions({ id: noteId }));
  if (content.data === undefined) return null;
  return (
    <NoteEditorLoaded
      noteId={noteId}
      content={content.data}
      onReady={onReady}
      editable={editable}
    />
  );
}

function NoteEditorLoaded({
  noteId,
  content,
  onReady,
  editable,
}: {
  noteId: NoteId;
  content: string;
  onReady?: (editor: Editor) => void;
  editable: boolean;
}) {
  const showError = useMutationErrorToast();
  // a task made from the note's text is linked to the note, in its project (the page has read it)
  const projectId = useQuery(trpc.notes.get.queryOptions({ id: noteId })).data?.projectId;
  const body = useEditorAutosave(content, (markdown) => {
    ipc.notes.updateContent
      .mutate({ id: noteId, content: markdown })
      .catch((error: unknown) => showError(error, 'Couldn’t save the note'));
  });
  return (
    <WorkspaceRichTextEditor
      label="Note"
      value={body.value}
      onChange={body.onChange}
      onReady={onReady}
      editable={editable}
      newTaskOptions={{ projectId, linkedNoteId: noteId }}
    />
  );
}
