import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useMatches, useNavigate, useSearch } from '@tanstack/react-router';
import { EntitySheet } from '../components/EntitySheet';
import { sheetKindOf, sheetKindsOf, type SheetId } from '../lib/sheet';
import type { SheetItem, SheetNavigation, ShowSheetOptions } from './use-sheet-navigation';

export interface UseSheetOptions {
  /**
   * False while the page is in a state with no sheet (the tasks views off the board): the param is
   * not read, so no sheet shows whatever the URL says.
   */
  enabled?: boolean;
}

/** A page's sheet: how the page opens an item in it, and the sheet itself to draw. */
export interface PageSheet extends SheetNavigation {
  /** the item the URL names, when the page shows it */
  id: SheetId | undefined;
  /** whether the sheet is open (it may still be drawn, sliding out, when not) */
  open: boolean;
  /** The sheet, to draw in the page: `{sheet.render()}`. Nothing while there is none. */
  render: () => ReactNode;
}

/**
 * The sheet beside a page, driven by the URL's `sheet` param: all a page with a sheet needs.
 *
 * ```tsx
 * const sheet = useSheet();
 * …
 * <Card onClick={() => sheet.show(task.id)} />
 * {sheet.render()}
 * ```
 *
 * The page's route says which kinds of item its sheet shows (`SHEET_KINDS_BY_ROUTE`), and the
 * sheet draws the content of the item's kind, so a page names no sheet component. Every page
 * behaves alike: showing an item pushes a history entry, another item pushes another, and closing
 * (×, Esc, a click outside a floating sheet) pushes one without the param. Back therefore undoes
 * each step, a close included, however the sheet was opened; nothing is kept in the history's
 * state. The page's other params are left as they are.
 */
export function useSheet({ enabled = true }: UseSheetOptions = {}): PageSheet {
  const navigate = useNavigate();
  // the page's route: the innermost one matched
  const routeId = useMatches({ select: (matches) => matches[matches.length - 1]?.routeId });
  const kinds = sheetKindsOf(routeId);
  // as the page's own schema read them: an id of a kind it doesn't show is already gone
  const search = useSearch({ strict: false });
  const id = enabled ? search.sheet : undefined;
  // the occurrence an event, or its note, is of; a task has none
  const occurrence = id && sheetKindOf(id) !== 'task' ? search.occurrence : undefined;

  // the item stays mounted once `sheet` leaves the URL, until its sheet has slid out
  const [shown, setShown] = useState<SheetItem | undefined>(() =>
    id ? { id, occurrence } : undefined,
  );
  if (id && (shown?.id !== id || shown.occurrence !== occurrence)) setShown({ id, occurrence });
  // the item just created here, so its sheet can say so; forgotten with the page, never in the URL
  const [created, setCreated] = useState<SheetId>();

  const write = useCallback(
    (item: SheetItem | undefined, replace = false) =>
      void navigate({
        to: '.',
        search: (previous) => ({ ...previous, sheet: item?.id, occurrence: item?.occurrence }),
        replace,
      }),
    [navigate],
  );

  const accepts = useCallback(
    (item: SheetId) => kinds.some((kind) => kind === sheetKindOf(item)),
    [kinds],
  );
  const show = useCallback(
    (next: SheetId, options: ShowSheetOptions = {}) => {
      if (!accepts(next)) return;
      if (next === id && options.occurrence === occurrence) return;
      if (options.created) setCreated(next);
      write({ id: next, occurrence: options.occurrence });
    },
    [accepts, id, occurrence, write],
  );
  const close = useCallback(
    (options: { replace?: boolean } = {}) => write(undefined, options.replace),
    [write],
  );
  const open = id !== undefined;
  const onClosed = useCallback(() => {
    if (!open) setShown(undefined);
  }, [open]);

  const navigation = useMemo(() => ({ accepts, show, close }), [accepts, show, close]);
  const item = useMemo(
    () => (shown ? { ...shown, created: shown.id === created } : undefined),
    [shown, created],
  );
  const render = useCallback(
    () => <EntitySheet item={item} open={open} navigation={navigation} onClosed={onClosed} />,
    [item, open, navigation, onClosed],
  );
  return useMemo(() => ({ ...navigation, id, open, render }), [navigation, id, open, render]);
}
