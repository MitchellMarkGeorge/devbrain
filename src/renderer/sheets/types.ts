import type { SheetId } from '@renderer/shared/lib/sheet';

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

/**
 * What a page, or a sheet's own content, may do with the page's sheet. `EntitySheet` hands it to
 * the content as its `sheet` prop, to show a linked item in the same sheet or close it.
 */
export interface SheetNavigation {
  /** whether this page's sheet shows items of this id's kind (the page lists them) */
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
