import { createContext, useContext, type ReactNode } from 'react';
import type { EventId, NoteId, TaskId } from '@common/ids';
import type { SheetId } from '../lib/sheet';

/** What a sheet shows: the item's id, and for one occurrence of a repeating event its start. */
export interface SheetItem<I extends SheetId = SheetId> {
  id: I;
  /** the calendar's `occurrence` param (ISO): which occurrence of a series was opened */
  occurrence?: string;
  /** the item was created as it was shown here: a note's sheet opens with the caret in its body */
  created?: boolean;
}

export interface ShowSheetOptions {
  /** the occurrence of a repeating event the item is, or (a note) is for */
  occurrence?: string;
  /** the item was just created: a note's sheet opens with the caret in its body */
  created?: boolean;
}

/** What a page, or a sheet's own content, may do with the page's sheet. */
export interface SheetNavigation {
  /** whether this page's sheet shows items of this id's kind (`SHEET_KINDS_BY_ROUTE`) */
  accepts: (id: SheetId) => boolean;
  /**
   * Shows an item in the sheet, as a history entry of its own. The item already shown adds none,
   * and one of a kind the page doesn't show is not shown (ask `accepts` to open it elsewhere).
   */
  show: (id: SheetId, options?: ShowSheetOptions) => void;
  /**
   * Closes the sheet: a new history entry without it, so Back shows the sheet again. `replace`
   * for an item that is gone (deleted), whose entry isn't worth returning to.
   */
  close: (options?: { replace?: boolean }) => void;
}

const SheetNavigationContext = createContext<SheetNavigation | null>(null);

/** Gives a sheet's content its `useSheetNavigation` (`EntitySheet` does). */
export function SheetNavigationProvider({
  value,
  children,
}: {
  value: SheetNavigation;
  children: ReactNode;
}) {
  return (
    <SheetNavigationContext.Provider value={value}>{children}</SheetNavigationContext.Provider>
  );
}

/** The sheet this content is drawn in: to show a linked item in it, or close it. */
export function useSheetNavigation(): SheetNavigation {
  const navigation = useContext(SheetNavigationContext);
  if (!navigation) throw new Error('useSheetNavigation needs a sheet around it (useSheet)');
  return navigation;
}

/**
 * What a sheet draws for each kind of item: its `SheetHeader` and `SheetBody`. The workspace
 * layout gives them (`layouts/workspace/sheet-contents.tsx`), as they are the features' own
 * components, which `shared` doesn't import.
 */
export interface SheetContents {
  task: (item: SheetItem<TaskId>) => ReactNode;
  note: (item: SheetItem<NoteId>) => ReactNode;
  event: (item: SheetItem<EventId>) => ReactNode;
}

const SheetContentsContext = createContext<SheetContents | null>(null);

export function SheetContentsProvider({
  value,
  children,
}: {
  value: SheetContents;
  children: ReactNode;
}) {
  return <SheetContentsContext.Provider value={value}>{children}</SheetContentsContext.Provider>;
}

export function useSheetContents(): SheetContents {
  const contents = useContext(SheetContentsContext);
  if (!contents) throw new Error('A sheet needs the workspace layout’s SheetContentsProvider');
  return contents;
}
