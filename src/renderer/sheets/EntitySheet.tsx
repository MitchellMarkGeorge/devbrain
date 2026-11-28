import { isId } from '@common/ids';
import { Sheet, SheetContent, useWorkspaceShell } from '@renderer/components';
import { EventSheet } from './EventSheet';
import { NoteSheet } from './NoteSheet';
import { TaskSheet } from './TaskSheet';
import type { SheetItem, SheetNavigation } from './types';
import { sheetKindOf } from '@renderer/shared/lib/sheet';

export interface EntitySheetProps {
  /** the item to draw: the URL's, or the last one while its sheet slides out */
  item: SheetItem | undefined;
  /** false once `sheet` has left the URL */
  open: boolean;
  navigation: SheetNavigation;
  /** it has finished sliding out */
  onClosed: () => void;
}

/**
 * The sheet beside a page, for the item its URL names (`?sheet=tsk_…`, `nte_…` or `evt_…`); a
 * page draws it with `useSheet().render()`. Docked in the shell's sheet column in wide and medium
 * windows, floating over the page in compact ones. One sheet stays open as its item changes, so
 * moving from an event to its note swaps the content rather than sliding a second sheet in. ×,
 * Esc and a click outside a floating sheet all close it the same way, and it stays mounted until
 * it has slid out.
 *
 * This is the one place that names the sheets' components: the content is picked here by the
 * id's prefix.
 */
export function EntitySheet({ item, open, navigation, onClosed }: EntitySheetProps) {
  const { size, sheetContainer } = useWorkspaceShell();
  const floating = size === 'compact';
  if (!item) return null;
  // on a first render the shell hasn't mounted its column yet: the sheet joins it a moment later
  if (!floating && !sheetContainer) return null;
  const { id } = item;
  return (
    <Sheet
      open={open}
      variant={floating ? 'overlay' : 'docked'}
      onOpenChange={(next) => {
        if (!next) navigation.close();
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed();
      }}
    >
      <SheetContent
        container={floating ? undefined : sheetContainer}
        data-testid={`${sheetKindOf(id)}-sheet`}
      >
        {isId('task', id) ? (
          <TaskSheet taskId={id} sheet={navigation} />
        ) : isId('note', id) ? (
          <NoteSheet
            noteId={id}
            occurrence={item.occurrence}
            created={item.created}
            sheet={navigation}
          />
        ) : isId('event', id) ? (
          <EventSheet eventId={id} occurrence={item.occurrence} sheet={navigation} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
