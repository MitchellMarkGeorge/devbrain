import { Code, Copy, FolderOpen, Trash2 } from 'lucide-react';
import type { Note } from '@common/types';
import { DropdownMenuItem, DropdownMenuSeparator, PageMenuButton } from '../../../components';
import { useCommands } from '../../../keyboard';
import { useOpenEntity } from '../../app/use-open-entity';
import { ProjectSubmenu } from '../../tasks/menus/TaskMenus';
import { LinkSubmenu } from '../menus/NoteMenus';
import type { NoteActions } from '../use-note-actions';

/**
 * The note page's "…" menu (Figma `7527:51820`): Link to ›, Change project ›, Duplicate (⌘D,
 * then opens the copy), Show in Finder, Copy as Markdown, Move to trash.
 */
export function NoteDetailMenu({
  note,
  actions,
  onTrash,
}: {
  note: Note;
  actions: NoteActions;
  onTrash: () => void;
}) {
  const openEntity = useOpenEntity();
  const duplicate = () =>
    actions.duplicate(note).then((copy) => {
      if (copy) openEntity(copy);
    });
  useCommands([{ id: 'page.duplicate', title: 'Duplicate', scope: 'global', run: duplicate }]);

  return (
    <PageMenuButton>
      <LinkSubmenu note={note} onPick={(link) => actions.setLink(note, link)} />
      <ProjectSubmenu
        projectId={note.projectId}
        label="Change project"
        onPick={(projectId) => actions.setProject([note], projectId)}
      />
      <DropdownMenuItem icon={Copy} shortcut="⌘D" onClick={() => void duplicate()}>
        Duplicate
      </DropdownMenuItem>
      <DropdownMenuItem icon={FolderOpen} onClick={() => actions.showInFolder(note)}>
        Show in Finder
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Code} onClick={() => actions.copyAsMarkdown(note)}>
        Copy as Markdown
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={Trash2} shortcut="⌘⌫" variant="destructive" onClick={onTrash}>
        Move to trash
      </DropdownMenuItem>
    </PageMenuButton>
  );
}
