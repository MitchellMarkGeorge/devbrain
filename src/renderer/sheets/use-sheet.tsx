import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { EntitySheet } from './EntitySheet';
import { sheetKindOf, type SheetId, type SheetKind } from '@renderer/shared/lib/sheet';
import type { SheetItem, SheetNavigation, ShowSheetOptions } from './types';

/** What a page tells `useSheet`: its sheet's params, as its own route's schema read them. */
export interface UseSheetOptions<I extends SheetId> {
  /**
   * The route's `sheet` param: the item to show. Undefined in a state of the page with no sheet,
   * whatever the URL says (the tasks views off the board).
   */
  id: I | undefined;
  /** the calendar's `occurrence` param: the occurrence of a repeating event that was opened */
  occurrence?: string;
  /** the kinds the page's sheet shows: the list its schema gave `sheetParam` */
  kinds: readonly SheetKind[];
}

/** A page's sheet: how the page opens an item in it, and the sheet itself to draw. */
export interface PageSheet<I extends SheetId = SheetId> extends SheetNavigation {
  /** the item the URL names */
  id: I | undefined;
  /** whether the sheet is open (it may still be drawn, sliding out, when not) */
  open: boolean;
  /** The sheet, to draw in the page: `{sheet.render()}`. Nothing while there is none. */
  render: () => ReactNode;
}

/**
 * The sheet beside a page. The page owns its search params, so it says what its sheet holds (the
 * `sheet` param its schema read, and the kinds that schema takes); the hook does the rest.
 *
 * ```tsx
 * const search = taskRoute.useSearch();
 * const sheet = useSheet({ id: search.sheet, kinds: TASK_PAGE_SHEET_KINDS });
 * …
 * <Card onClick={() => sheet.show(note.id)} />
 * {sheet.render()}
 * ```
 *
 * `render()` draws the sheet with the content of the item's kind, so a page names no sheet
 * component. Every page behaves alike: showing an item pushes a history entry, another item pushes
 * another, and closing (×, Esc, a click outside a floating sheet) pushes one without the param.
 * Back therefore undoes each step, a close included, however the sheet was opened; nothing is kept
 * in the history's state. The page's other params are left as they are.
 */
export function useSheet<I extends SheetId>({
  id,
  occurrence,
  kinds,
}: UseSheetOptions<I>): PageSheet<I> {
  const navigate = useNavigate();

  // the item stays mounted once `sheet` leaves the URL, until its sheet has slid out
  const [drawnItem, setDrawnItem] = useState<SheetItem | undefined>(() =>
    id ? { id, occurrence } : undefined,
  );
  if (id && (drawnItem?.id !== id || drawnItem.occurrence !== occurrence))
    setDrawnItem({ id, occurrence });
  // the item just created here, so its sheet can say so; forgotten with the page, never in the URL
  const [created, setCreated] = useState<SheetId>();

  // puts an item (or none) in the URL's `sheet` and `occurrence`, leaving the page's other params
  const navigateToItem = useCallback(
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
      navigateToItem({ id: next, occurrence: options.occurrence });
    },
    [accepts, id, occurrence, navigateToItem],
  );
  const close = useCallback(
    (options: { replace?: boolean } = {}) => navigateToItem(undefined, options.replace),
    [navigateToItem],
  );
  // `id` is the URL's, read again on every render: the sheet is open while the URL names an item.
  // `drawnItem` differs only as it closes, when it still holds the item for the sheet to slide out with
  const open = id !== undefined;
  const onClosed = useCallback(() => {
    if (!open) setDrawnItem(undefined);
  }, [open]);

  const navigation = useMemo(() => ({ accepts, show, close }), [accepts, show, close]);
  const item = useMemo(
    () => (drawnItem ? { ...drawnItem, created: drawnItem.id === created } : undefined),
    [drawnItem, created],
  );
  const render = useCallback(
    () => <EntitySheet item={item} open={open} navigation={navigation} onClosed={onClosed} />,
    [item, open, navigation, onClosed],
  );
  return useMemo(() => ({ ...navigation, id, open, render }), [navigation, id, open, render]);
}
