import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { sheetKindOf, type SheetKind } from '../lib/sheet';

/** What a sheet shows: the item's id, and for one occurrence of a repeating event its start. */
export interface SheetItem<I extends string = string> {
  id: I;
  /** the calendar's `occurrence` param (ISO): which occurrence of a series was opened */
  occurrence?: string;
  /** the item was created as it was shown here: a note's sheet opens with the caret in its body */
  created?: boolean;
}

/** The sheet's params as a page's URL holds them; undefined leaves one out. */
export interface SheetParams<I extends string = string> {
  sheet: I | undefined;
  occurrence: string | undefined;
}

export interface ShowSheetOptions {
  /** the occurrence of a repeating event the item is, or (a note) is for */
  occurrence?: string;
  /** the item was just created: a note's sheet opens with the caret in its body */
  created?: boolean;
}

/** What a sheet's own content may do: show another item in it, or close it. */
export interface SheetNavigation {
  /** whether this page's sheet shows items of this id's kind (a page lists the kinds it opens) */
  accepts: (id: string) => boolean;
  /** shows an item in the sheet, as a history entry of its own; the item already shown adds none */
  show: (id: string, options?: ShowSheetOptions) => void;
  /**
   * Closes the sheet: a new history entry without it, so Back shows the sheet again. `replace`
   * for an item that is gone (deleted), whose entry isn't worth returning to.
   */
  close: (options?: { replace?: boolean }) => void;
}

/** A page's sheet, from its URL: what `EntitySheet` draws, and how the page opens an item in it. */
export interface SheetControls<I extends string = string> {
  /** the item to draw: the URL's, or the last one while its sheet slides out */
  item: SheetItem<I> | undefined;
  /** false once `sheet` has left the URL; the item stays until `onClosed` */
  open: boolean;
  /** shows one of the page's items in the sheet (`SheetNavigation.show`, typed to the page's ids) */
  show: (id: I, options?: ShowSheetOptions) => void;
  close: SheetNavigation['close'];
  /** the same, for the sheet's content (`useSheetNavigation`) */
  navigation: SheetNavigation;
  /** the sheet has finished sliding out */
  onClosed: () => void;
}

export interface UseSheetOptions<I extends string> {
  /** the route's `sheet` param, as its schema read it */
  id: I | undefined;
  /** the calendar's `occurrence` param */
  occurrence?: string;
  /** the kinds the route's schema takes (the same list it gave `sheetParam`) */
  kinds: readonly SheetKind[];
  /**
   * Writes the sheet's params into the page's URL with the route's own navigate, keeping its
   * other params: a new history entry, or with `replace` in place of this one. The page gives it
   * so the write is typed against its route's search; a page without `occurrence` ignores it.
   */
  write: (params: SheetParams<I>, options: { replace: boolean }) => void;
}

/**
 * The sheet beside a page, driven by the URL's `sheet` param. Every page with a sheet uses this,
 * so they all behave alike: showing an item pushes a history entry, another item pushes another,
 * and closing (×, Esc, a click outside a floating sheet) pushes one without the param. Back
 * therefore undoes each step, a close included, however the sheet was opened; nothing is kept in
 * the history's state. The page's other params are left as they are: the page writes the sheet's
 * with its own route's navigate (`write`).
 */
export function useSheet<I extends string>({
  id,
  occurrence,
  kinds,
  write,
}: UseSheetOptions<I>): SheetControls<I> {
  // the item stays mounted once `sheet` leaves the URL, until its sheet has slid out
  const [shown, setShown] = useState<SheetItem<I> | undefined>(() =>
    id ? { id, occurrence } : undefined,
  );
  if (id && (shown?.id !== id || shown.occurrence !== occurrence)) setShown({ id, occurrence });

  // the item just created here, so its sheet can say so; forgotten with the page, never in the URL
  const [created, setCreated] = useState<string>();

  // the route's schema read `id` as one of these kinds, so an id of one of them is one of the page's
  const accepts = useCallback(
    (item: string): item is I => kinds.includes(sheetKindOf(item)!),
    [kinds],
  );
  const show = useCallback(
    (next: I, options: ShowSheetOptions = {}) => {
      if (next === id && options.occurrence === occurrence) return;
      if (options.created) setCreated(next);
      write({ sheet: next, occurrence: options.occurrence }, { replace: false });
    },
    [id, occurrence, write],
  );
  const close = useCallback(
    (options: { replace?: boolean } = {}) =>
      write({ sheet: undefined, occurrence: undefined }, { replace: options.replace ?? false }),
    [write],
  );
  const open = id !== undefined;
  const onClosed = useCallback(() => {
    if (!open) setShown(undefined);
  }, [open]);

  const navigation = useMemo<SheetNavigation>(
    () => ({
      accepts,
      // content names an item by its id alone: one of a kind the page doesn't show is not shown
      show: (next, options) => {
        if (accepts(next)) show(next, options);
      },
      close,
    }),
    [accepts, show, close],
  );
  const item = useMemo(
    () => (shown ? { ...shown, created: shown.id === created } : undefined),
    [shown, created],
  );
  return useMemo(
    () => ({ item, open, show, close, onClosed, navigation }),
    [item, open, show, close, onClosed, navigation],
  );
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
  if (!navigation) throw new Error('useSheetNavigation needs an EntitySheet around it');
  return navigation;
}
