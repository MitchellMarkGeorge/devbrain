import { Folder, Star, Trash2 } from 'lucide-react';
import type { NoteListItem } from '@common/types';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SelectionBar,
} from '../../../components';
import { PickerSearchFilter } from '../../search/picker-search';
import { ProjectItems } from '../../tasks/menus/TaskMenus';
import type { NoteActions } from '../use-note-actions';
import styles from './NotesView.module.css';

export interface NotesSelectionBarProps {
  /** the selected notes, loaded */
  notes: NoteListItem[];
  actions: NoteActions;
  onClear: () => void;
}

const ABOVE = { side: 'top', align: 'start', sideOffset: 8 } as const;

/**
 * The selection bar over the notes list, as the tasks list's (Figma `7424:38163`): the count,
 * then Move (to a project), Favorite and Move to trash for every selected note, and clear. A
 * note has no status, priority or due date, so those aren't offered.
 */
export function NotesSelectionBar({ notes, actions, onClear }: NotesSelectionBarProps) {
  const allFavorites = notes.every((note) => note.favoritedAt);
  return (
    <div className={styles.bar}>
      <SelectionBar
        open={notes.length > 0}
        count={notes.length}
        floating={false}
        aria-label="Selected notes"
        onClear={onClear}
        actions={
          <>
            <PickerSearchFilter>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="sm" icon={Folder} />}>
                  Move
                </DropdownMenuTrigger>
                <DropdownMenuContent {...ABOVE} width="lg">
                  <ProjectItems
                    projectId={undefined}
                    onPick={(id) => actions.setProject(notes, id)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </PickerSearchFilter>
            <Button
              variant="ghost"
              size="sm"
              icon={Star}
              onClick={() => actions.toggleFavorite(notes)}
            >
              {allFavorites ? 'Unfavorite' : 'Favorite'}
            </Button>
          </>
        }
        more={
          <DropdownMenuItem
            icon={Trash2}
            shortcut="⌘⌫"
            variant="destructive"
            onClick={() => {
              void actions.trash(notes).then((moved) => {
                if (moved) onClear();
              });
            }}
          >
            Move to trash
          </DropdownMenuItem>
        }
      />
    </div>
  );
}
