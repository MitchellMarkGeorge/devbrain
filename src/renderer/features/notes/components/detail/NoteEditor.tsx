import { useQuery } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import type { NoteId } from '@common/ids';
import { RichTextEditor } from '@renderer/editor/RichTextEditor';
import { ipc, trpc } from '@renderer/ipc';
import { useEditorAutosave } from '@renderer/shared/hooks/use-autosave';
import { useEditorHost } from '@renderer/shared/hooks/use-editor-host';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';

/**
 * A note's body in the rich text editor: its markdown from `notes.readContent` (primed by the
 * route's loader), saved through `notes.updateContent` 500ms after typing stops, and at once on
 * leaving the page, on the window losing focus and on a workspace switch. The save's own refetch
 * never replaces what was typed after it; a change from elsewhere (the file edited on disk) does.
 * Key it by the note's id, so a save still pending goes to the note it was typed for.
 */
export function NoteEditor({
  noteId,
  onReady,
}: {
  noteId: NoteId;
  onReady?: (editor: Editor) => void;
}) {
  const content = useQuery(trpc.notes.readContent.queryOptions({ id: noteId }));
  if (content.data === undefined) return null;
  return <NoteEditorLoaded noteId={noteId} content={content.data} onReady={onReady} />;
}

function NoteEditorLoaded({
  noteId,
  content,
  onReady,
}: {
  noteId: NoteId;
  content: string;
  onReady?: (editor: Editor) => void;
}) {
  const host = useEditorHost();
  const showError = useMutationErrorToast();
  const body = useEditorAutosave(content, (markdown) => {
    ipc.notes.updateContent
      .mutate({ id: noteId, content: markdown })
      .catch((error: unknown) => showError(error, 'Couldn’t save the note'));
  });
  return (
    <RichTextEditor
      {...host}
      label="Note"
      value={body.value}
      onChange={body.onChange}
      onReady={onReady}
    />
  );
}
