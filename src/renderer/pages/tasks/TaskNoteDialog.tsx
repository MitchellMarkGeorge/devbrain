import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Maximize2 } from 'lucide-react';
import type { NoteId } from '@common/ids';
import { Button, Dialog, DialogContent, DialogTitle, Skeleton, Stack } from '../../components';
import { RichTextEditor } from '../../editor/RichTextEditor';
import { useWorkspaceEditorHost } from '../../editor/use-workspace-host';
import { ipc, trpc } from '../../ipc';
import { KeyScope } from '../../keyboard';
import type { ModalProps } from '../../modals';
import { useMutationErrorToast } from '../app/mutation-errors';
import { useAutosave } from './TaskPageAutosave';
import styles from './TaskNoteDialog.module.css';

export interface TaskNoteDialogProps extends ModalProps {
  noteId: NoteId;
  /** "Open full view": the note's page (passed in, as dialogs render outside the page) */
  onOpenFullView?: () => void;
}

/**
 * The task note dialog (Figma `7412:37391`): the note's title and its markdown in the rich text
 * editor, saved as you type (debounced, and flushed when the dialog closes), with "Open full
 * view" for the note's page.
 */
export function TaskNoteDialog({ noteId, onOpenFullView, ...modal }: TaskNoteDialogProps) {
  const note = useQuery(trpc.notes.get.queryOptions({ id: noteId }));
  const content = useQuery(trpc.notes.readContent.queryOptions({ id: noteId }));
  const host = useWorkspaceEditorHost();
  const showError = useMutationErrorToast();
  const [title, setTitle] = useState<string | null>(null);
  const saveContent = useAutosave((markdown: string) => {
    ipc.notes.updateContent
      .mutate({ id: noteId, content: markdown })
      .catch((error: unknown) => showError(error, 'Couldn’t save the note'));
  });

  const saveTitle = () => {
    if (title === null || title === note.data?.title) return;
    ipc.notes.update
      .mutate({ id: noteId, title })
      .catch((error: unknown) => showError(error, 'Couldn’t rename the note'));
  };

  return (
    <Dialog
      {...modal}
      onOpenChange={(open) => {
        if (!open) {
          saveContent.flush();
          saveTitle();
        }
        modal.onOpenChange(open);
      }}
    >
      <DialogContent className={styles.dialog} showClose aria-label="Task note">
        <KeyScope name="dialog">
          <div className={styles.header}>
            <DialogTitle>Task note</DialogTitle>
            {onOpenFullView && (
              <Button
                size="xs"
                variant="ghost"
                icon={Maximize2}
                style={{ marginRight: 32 }}
                onClick={() => {
                  saveContent.flush();
                  saveTitle();
                  modal.onOpenChange(false);
                  onOpenFullView();
                }}
              >
                Open full view
              </Button>
            )}
          </div>
          <div className={styles.body}>
            <input
              className={styles.title}
              aria-label="Note title"
              placeholder="Untitled"
              value={title ?? note.data?.title ?? ''}
              onChange={(event) => setTitle(event.currentTarget.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            {content.data === undefined ? (
              <Stack gap="2" aria-busy>
                <Skeleton height={16} width="80%" />
                <Skeleton height={16} width="60%" />
              </Stack>
            ) : (
              <RichTextEditor
                {...host}
                label="Task note"
                value={content.data}
                placeholder="Write the task’s notes…"
                onChange={saveContent.schedule}
              />
            )}
          </div>
        </KeyScope>
      </DialogContent>
    </Dialog>
  );
}
