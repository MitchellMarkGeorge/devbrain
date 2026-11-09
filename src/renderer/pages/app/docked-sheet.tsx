import { createContext, useContext, useEffect } from 'react';

// A sheet docked beside the page (the board's task sheet, later the calendar's event sheet): the
// workspace layout opens WorkspaceShell's sheet column while a page says one is showing.

const DockedSheetContext = createContext<((open: boolean) => void) | null>(null);

/**
 * The workspace layout's side: the context's value is the setter; pass `sheetOpen` to
 * `WorkspaceShell`.
 */
export const DockedSheetProvider = DockedSheetContext.Provider;

/**
 * Opens the shell's sheet column while `open` (and the component) lasts: a page's docked sheet
 * calls it, then portals its `SheetContent` into `useWorkspaceShell().sheetContainer`. A sheet
 * that floats (compact windows) passes false.
 */
export function useDockedSheet(open: boolean): void {
  const setSheetOpen = useContext(DockedSheetContext);
  useEffect(() => {
    if (!setSheetOpen || !open) return;
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, [setSheetOpen, open]);
}
