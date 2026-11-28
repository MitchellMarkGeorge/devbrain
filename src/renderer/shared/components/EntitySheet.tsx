import type { ReactNode } from 'react';
import { Sheet, SheetContent, useWorkspaceShell } from '@renderer/components';
import { SheetNavigationProvider, type SheetControls, type SheetItem } from '../hooks/use-sheet';
import { sheetKindOf } from '../lib/sheet';

export interface EntitySheetProps<I extends string> {
  /** the page's sheet (`useSheet`) */
  sheet: SheetControls<I>;
  /** the item's content: its `SheetHeader` and `SheetBody` (`TaskSheet`, `NoteSheet`, `EventSheet`) */
  children: (item: SheetItem<I>) => ReactNode;
}

/**
 * The sheet beside a page, for the item its URL names (`?sheet=tsk_…`, `nte_…` or `evt_…`):
 * docked in the shell's sheet column in wide and medium windows, floating over the page in compact
 * ones. One sheet stays open as its item changes, so moving from an event to its note swaps the
 * content rather than sliding a second sheet in. ×, Esc and a click outside a floating sheet all
 * close it the same way (`useSheet`), and it stays mounted until it has slid out.
 */
export function EntitySheet<I extends string>({ sheet, children }: EntitySheetProps<I>) {
  const { size, sheetContainer } = useWorkspaceShell();
  const floating = size === 'compact';
  const { item } = sheet;
  if (!item) return null;
  // on a first render the shell hasn't mounted its column yet: the sheet joins it a moment later
  if (!floating && !sheetContainer) return null;
  return (
    <SheetNavigationProvider value={sheet.navigation}>
      <Sheet
        open={sheet.open}
        variant={floating ? 'overlay' : 'docked'}
        onOpenChange={(next) => {
          if (!next) sheet.close();
        }}
        onOpenChangeComplete={(next) => {
          if (!next) sheet.onClosed();
        }}
      >
        <SheetContent
          container={floating ? undefined : sheetContainer}
          data-testid={`${sheetKindOf(item.id)}-sheet`}
        >
          {children(item)}
        </SheetContent>
      </Sheet>
    </SheetNavigationProvider>
  );
}
