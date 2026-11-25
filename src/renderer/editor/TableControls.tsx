import type { Editor } from '@tiptap/core';
import type { Selection } from '@tiptap/pm/state';
import type { Rect } from '@tiptap/pm/tables';
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  DropdownMenu,
  TableAddButton,
  TableCellToolbar,
  TableHandle,
  TableInsertButton,
  TableMenu,
  TableToolbar,
  toast,
  type TableAlignment,
  type TableAxis,
} from '@renderer/components';
import { setTableDanger } from './extensions/table-controls';
import * as tables from './table-commands';
import styles from './TableControls.module.css';

/**
 * The controls around a table while you work in it, drawn over the editor (a layer the size of
 * the editor, so they scroll with it). The table is the one under the pointer, or the one the
 * caret is in while the editor has focus.
 *
 * - A `TableHandle` on the edge of the column and the row under the pointer (or the caret).
 *   Clicking it selects the column or row and opens its `TableMenu`; dragging it moves the column
 *   or row, a blue line showing where it lands.
 * - Near the line between two columns (above the table) or rows (left of it), a
 *   `TableInsertButton` inserts one there.
 * - The `TableAddButton` bars under and beside the table add a row or column at the end.
 * - The `TableToolbar` over its top right corner: Header row, the size, Copy as Markdown, Delete
 *   table. Not while text is selected, when the format toolbar is up.
 * - A block of cells selected by dragging gets the `TableCellToolbar` over it (under it when it
 *   starts at the first row).
 *
 * Deletes tint what they would remove while pointed at (`setTableDanger`), and say what they did
 * in a toast with Undo. Everything they do is one undo step (table-commands.ts).
 */

interface Span {
  start: number;
  end: number;
}

// a table's box and its rows and columns, relative to the layer
interface Geometry {
  left: number;
  top: number;
  right: number;
  bottom: number;
  rows: Span[];
  cols: Span[];
}

interface Hover {
  tablePos: number;
  row: number;
  col: number;
  // the line between two columns or rows the pointer is near, outside the table
  insert: { axis: TableAxis; index: number } | null;
}

interface MenuState {
  axis: TableAxis;
  tablePos: number;
  index: number;
  // the selection and document when it opened: put back if it closes having done nothing
  selection: Selection;
  doc: Editor['state']['doc'];
}

interface Drag {
  axis: TableAxis;
  tablePos: number;
  from: number;
  to: number;
  x: number;
  y: number;
  moved: boolean;
}

// how far around a table the pointer still counts as over it: the handles' and +'s strip on the
// left and above, the toolbar above that, the add bars right and under
const ZONE = { left: 30, top: 64, right: 28, bottom: 28 };
// how near a line between two columns or rows the pointer must be for its +
const INSERT_REACH = 10;
// how far the pointer moves on a handle before a press is a drag
const DRAG_THRESHOLD = 4;

function measure(editor: Editor, tablePos: number, layer: HTMLElement): Geometry | null {
  const dom = editor.view.nodeDOM(tablePos);
  if (!(dom instanceof HTMLElement)) return null;
  const table = dom instanceof HTMLTableElement ? dom : dom.querySelector('table');
  if (!table || table.rows.length === 0) return null;
  const origin = layer.getBoundingClientRect();
  const box = table.getBoundingClientRect();
  const rows = Array.from(table.rows, (row) => {
    const r = row.getBoundingClientRect();
    return { start: r.top - origin.top, end: r.bottom - origin.top };
  });
  const cols = Array.from(table.rows[0].cells, (cell) => {
    const r = cell.getBoundingClientRect();
    return { start: r.left - origin.left, end: r.right - origin.left };
  });
  return {
    left: box.left - origin.left,
    top: box.top - origin.top,
    right: box.right - origin.left,
    bottom: box.bottom - origin.top,
    rows,
    cols,
  };
}

// the span `at` falls in, or the nearest
function spanAt(spans: Span[], at: number): number {
  let index = 0;
  for (let i = 0; i < spans.length; i += 1) if (at >= spans[i].start) index = i;
  return index;
}

// the lines between spans, both outer edges included
const linesOf = (spans: Span[]) => [spans[0].start, ...spans.map((span) => span.end)];

// the line nearest `at`, if within reach
function nearestLine(spans: Span[], at: number): number | null {
  let best: number | null = null;
  let distance = INSERT_REACH;
  linesOf(spans).forEach((line, index) => {
    const d = Math.abs(line - at);
    if (d <= distance) {
      distance = d;
      best = index;
    }
  });
  return best;
}

// where a dragged column or row would land: the line before the span whose middle is past `at`
function dropIndex(spans: Span[], at: number): number {
  let index = 0;
  spans.forEach((span, i) => {
    if (at > (span.start + span.end) / 2) index = i + 1;
  });
  return index;
}

const sameHover = (a: Hover | null, b: Hover | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.tablePos === b.tablePos &&
    a.row === b.row &&
    a.col === b.col &&
    a.insert?.axis === b.insert?.axis &&
    a.insert?.index === b.insert?.index);

const at = (left: number, top: number, extra?: CSSProperties): CSSProperties => ({
  left,
  top,
  ...extra,
});

export function TableControls({ editor }: { editor: Editor }) {
  // the layer, as state: what is drawn is measured from it
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [hover, setHover] = useState<Hover | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [insertLine, setInsertLine] = useState(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const columnHandle = useRef<HTMLButtonElement>(null);
  const rowHandle = useRef<HTMLButtonElement>(null);
  const acted = useRef(false);

  // the table and cell under the pointer, from its last position
  const findHover = useCallback((): Hover | null => {
    const point = pointer.current;
    if (!point || !host || editor.isDestroyed) return null;
    const origin = host.getBoundingClientRect();
    const x = point.x - origin.left;
    const y = point.y - origin.top;
    let found: Hover | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (node.type.spec.tableRole !== 'table') return true;
      const dom = editor.view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) return false;
      const box = dom.getBoundingClientRect();
      if (
        point.x < box.left - ZONE.left ||
        point.x > box.right + ZONE.right ||
        point.y < box.top - ZONE.top ||
        point.y > box.bottom + ZONE.bottom
      ) {
        return false;
      }
      const geometry = measure(editor, pos, host);
      if (
        geometry &&
        x >= geometry.left - ZONE.left &&
        x <= geometry.right + ZONE.right &&
        y >= geometry.top - ZONE.top &&
        y <= geometry.bottom + ZONE.bottom
      ) {
        let insert: Hover['insert'] = null;
        const info = tables.tableAt(editor.state.doc, pos);
        const inTopStrip = y < geometry.top && y >= geometry.top - 24;
        const inLeftStrip = x < geometry.left && x >= geometry.left - 26;
        if (inTopStrip && x >= geometry.left - INSERT_REACH && x <= geometry.right + INSERT_REACH) {
          const index = nearestLine(geometry.cols, x);
          if (index !== null) insert = { axis: 'column', index };
        } else if (inLeftStrip && y >= geometry.top - INSERT_REACH) {
          const index = nearestLine(geometry.rows, y);
          // nothing goes above the header row
          if (index !== null && !(info?.hasHeader && index === 0)) insert = { axis: 'row', index };
        }
        found = {
          tablePos: pos,
          row: spanAt(geometry.rows, y),
          col: spanAt(geometry.cols, x),
          insert,
        };
      }
      return false;
    });
    return found;
  }, [editor, host]);

  const updateHover = useCallback(() => {
    const next = findHover();
    setHover((current) => (sameHover(current, next) ? current : next));
  }, [findHover]);

  // the pointer anywhere: the controls sit outside the editor's text, so leaving it isn't leaving
  // the table
  useEffect(() => {
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          updateHover();
        });
      }
    };
    const onLeave = () => {
      pointer.current = null;
      updateHover();
    };
    document.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [updateHover]);

  // an edit, a new selection, focus or a new size moves or changes the table
  useEffect(() => {
    const onChange = () => {
      updateHover();
      redraw();
    };
    editor.on('transaction', onChange);
    editor.on('focus', onChange);
    editor.on('blur', onChange);
    const observer = new ResizeObserver(onChange);
    observer.observe(editor.view.dom);
    window.addEventListener('resize', onChange);
    return () => {
      editor.off('transaction', onChange);
      editor.off('focus', onChange);
      editor.off('blur', onChange);
      observer.disconnect();
      window.removeEventListener('resize', onChange);
    };
  }, [editor, updateHover]);

  // the tint goes with the controls
  useEffect(() => () => setTableDanger(editor, null), [editor]);

  const { state } = editor;
  const caretTable = editor.isFocused ? tables.tableAround(state) : null;
  const tablePos = menu?.tablePos ?? drag?.tablePos ?? hover?.tablePos ?? caretTable?.pos ?? null;
  const info = tablePos !== null ? tables.tableAt(state.doc, tablePos) : null;
  const geometry = info && host ? measure(editor, info.pos, host) : null;

  // ---------- what the controls do ----------

  const refocus = () => requestAnimationFrame(() => editor.isDestroyed || editor.view.focus());

  const deleted = (title: string) => {
    const doc = editor.state.doc;
    toast({
      title,
      action: {
        label: 'Undo',
        // only while nothing else has changed, so Undo takes back this and nothing more
        onClick: () => {
          if (!editor.isDestroyed && editor.state.doc === doc) editor.commands.undo();
        },
      },
    });
  };

  const preview = (danger: { tablePos: number; rect: Rect } | null) =>
    setTableDanger(editor, danger);

  const openMenu = (axis: TableAxis, index: number) => {
    if (!info) return;
    acted.current = false;
    const selection = editor.state.selection;
    tables.selectLine(editor, info.pos, axis, index);
    setMenu({ axis, tablePos: info.pos, index, selection, doc: editor.state.doc });
  };

  // `refocusEditor` false when it closed on a press elsewhere, which takes the focus where it was
  const closeMenu = (refocusEditor: boolean) => {
    setTableDanger(editor, null);
    // closed having done nothing: the selection goes back to where it was
    if (menu && !acted.current && !editor.isDestroyed) {
      const { selection, doc } = menu;
      const { state: now } = editor;
      if (now.doc.eq(doc)) {
        const restored = selection.map(now.doc, now.tr.mapping);
        editor.view.dispatch(now.tr.setSelection(restored));
      }
    }
    setMenu(null);
    if (refocusEditor) refocus();
  };

  const act = (run: () => void) => () => {
    acted.current = true;
    setTableDanger(editor, null);
    run();
    refocus();
  };

  // ---------- handles: click for the menu, drag to move ----------

  const onHandleDown = (axis: TableAxis, index: number) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || !info) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      axis,
      tablePos: info.pos,
      from: index,
      to: index,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    });
  };

  const onHandleMove = (event: ReactPointerEvent) => {
    if (!drag || !host || !info) return;
    const moved =
      drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > DRAG_THRESHOLD;
    // the header row stays first
    if (!moved || (drag.axis === 'row' && info.hasHeader && drag.from === 0)) return;
    const g = measure(editor, info.pos, host);
    if (!g) return;
    const origin = host.getBoundingClientRect();
    let to =
      drag.axis === 'column'
        ? dropIndex(g.cols, event.clientX - origin.left)
        : dropIndex(g.rows, event.clientY - origin.top);
    if (drag.axis === 'row' && info.hasHeader) to = Math.max(1, to);
    if (moved !== drag.moved || to !== drag.to) setDrag({ ...drag, moved, to });
  };

  const onHandleUp = () => {
    const done = drag;
    setDrag(null);
    if (!done || !info) return;
    if (!done.moved) {
      openMenu(done.axis, done.from);
      return;
    }
    // `to` is a line between spans; the index the span ends up at counts it once taken out
    const target = done.to > done.from ? done.to - 1 : done.to;
    if (target === done.from) return;
    if (done.axis === 'column') tables.moveColumn(editor, info.pos, done.from, target, 0);
    else tables.moveRow(editor, info.pos, done.from, target, 0);
    refocus();
  };

  if (!info || !geometry || !host) {
    return <div ref={setHost} className={styles.layer} />;
  }

  // ---------- what to draw ----------

  const hovered = hover?.tablePos === info.pos;
  const caret = caretTable?.pos === info.pos ? tables.selectedCell(state, info) : null;
  const cellRect = tables.selectedRect(state, info);
  const textSelected = !state.selection.empty && !cellRect;
  const lineSelected =
    cellRect &&
    ((cellRect.left === 0 && cellRect.right === info.cols) ||
      (cellRect.top === 0 && cellRect.bottom === info.rows));

  const handleCol =
    menu?.axis === 'column'
      ? menu.index
      : drag?.axis === 'column'
        ? drag.from
        : hovered && hover
          ? hover.col
          : caret?.col;
  const handleRow =
    menu?.axis === 'row'
      ? menu.index
      : drag?.axis === 'row'
        ? drag.from
        : hovered && hover
          ? hover.row
          : caret?.row;
  const showColumnHandle =
    handleCol !== undefined &&
    handleCol < info.cols &&
    menu?.axis !== 'row' &&
    drag?.axis !== 'row';
  const showRowHandle =
    handleRow !== undefined &&
    handleRow < info.rows &&
    menu?.axis !== 'column' &&
    drag?.axis !== 'column';
  const width = geometry.right - geometry.left;
  const height = geometry.bottom - geometry.top;
  const insert = hovered && !menu && !drag ? hover.insert : null;
  const insertAt = insert
    ? linesOf(insert.axis === 'column' ? geometry.cols : geometry.rows)[insert.index]
    : 0;
  const dropAt =
    drag?.moved && !(drag.axis === 'row' && info.hasHeader && drag.from === 0)
      ? linesOf(drag.axis === 'column' ? geometry.cols : geometry.rows)[drag.to]
      : null;
  const whole: Rect = { left: 0, top: 0, right: info.cols, bottom: info.rows };

  // the menu's column or row
  const menuInfo = menu && menu.tablePos === info.pos ? menu : null;
  const menuLine = (index: number, axis: TableAxis): Rect =>
    axis === 'column'
      ? { left: index, right: index + 1, top: 0, bottom: info.rows }
      : { left: 0, right: info.cols, top: index, bottom: index + 1 };

  return (
    <div ref={setHost} className={styles.layer}>
      {showColumnHandle && (
        <TableHandle
          ref={columnHandle}
          axis="column"
          active={menuInfo?.axis === 'column' || (drag?.axis === 'column' && drag.moved)}
          className={styles.control}
          style={at(
            (geometry.cols[handleCol].start + geometry.cols[handleCol].end) / 2 - 12,
            geometry.top - 18,
          )}
          onPointerDown={onHandleDown('column', handleCol)}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openMenu('column', handleCol);
            }
          }}
        />
      )}
      {showRowHandle && (
        <TableHandle
          ref={rowHandle}
          axis="row"
          active={menuInfo?.axis === 'row' || (drag?.axis === 'row' && drag.moved)}
          className={styles.control}
          style={at(
            geometry.left - 18,
            (geometry.rows[handleRow].start + geometry.rows[handleRow].end) / 2 - 12,
          )}
          onPointerDown={onHandleDown('row', handleRow)}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openMenu('row', handleRow);
            }
          }}
        />
      )}

      {insert && (
        <TableInsertButton
          axis={insert.axis}
          className={styles.control}
          style={
            insert.axis === 'column'
              ? at(insertAt - 8, geometry.top - 20)
              : at(geometry.left - 22, insertAt - 8)
          }
          onPointerEnter={() => setInsertLine(true)}
          onPointerLeave={() => setInsertLine(false)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setInsertLine(false);
            if (insert.axis === 'column') tables.insertColumn(editor, info.pos, insert.index, 0);
            else tables.insertRow(editor, info.pos, insert.index, hover?.col ?? 0);
            refocus();
          }}
        />
      )}
      {insert && insertLine && (
        <div
          className={styles.line}
          style={
            insert.axis === 'column'
              ? at(insertAt - 1, geometry.top, { width: 2, height })
              : at(geometry.left, insertAt - 1, { width, height: 2 })
          }
        />
      )}
      {dropAt !== null && drag && (
        <div
          className={styles.line}
          style={
            drag.axis === 'column'
              ? at(dropAt - 1, geometry.top, { width: 2, height })
              : at(geometry.left, dropAt - 1, { width, height: 2 })
          }
        />
      )}

      {hovered && !drag && (
        <>
          <TableAddButton
            axis="row"
            className={styles.control}
            style={at(geometry.left, geometry.bottom + 1, { width })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              tables.insertRow(editor, info.pos, info.rows, 0);
              refocus();
            }}
          />
          <TableAddButton
            axis="column"
            className={styles.control}
            style={at(geometry.right + 5, geometry.top, { height })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              tables.insertColumn(editor, info.pos, info.cols, 0);
              refocus();
            }}
          />
        </>
      )}

      {(hovered || caret || menuInfo) && !textSelected && !drag && (
        <div className={styles.toolbar} style={at(geometry.right, geometry.top - 22)}>
          <TableToolbar
            headerRow={info.hasHeader}
            rows={info.rows}
            cols={info.cols}
            onHeaderRowChange={() => tables.toggleHeaderRow(editor, info.pos)}
            onCopy={() => {
              const markdown = tables.tableMarkdown(editor, info.pos);
              navigator.clipboard.writeText(markdown).then(
                () => toast({ title: 'Copied as Markdown' }),
                () => toast({ title: 'Couldn’t copy the table', tone: 'error' }),
              );
            }}
            onDelete={() => {
              setTableDanger(editor, null);
              if (tables.deleteTable(editor, info.pos)) deleted('Table deleted');
              refocus();
            }}
            onDeletePreviewChange={(on) => preview(on ? { tablePos: info.pos, rect: whole } : null)}
          />
        </div>
      )}

      {cellRect && !lineSelected && !menu && !drag && (
        <div
          className={styles.cellToolbar}
          // over the selection, or under it when it starts at the first row, whose top the
          // column handles and the table's bar sit on
          data-side={cellRect.top === 0 ? 'bottom' : 'top'}
          style={at(
            (geometry.cols[cellRect.left].start + geometry.cols[cellRect.right - 1].end) / 2,
            cellRect.top === 0
              ? geometry.rows[cellRect.bottom - 1].end + 8
              : geometry.rows[cellRect.top].start - 8,
          )}
        >
          <TableCellToolbar
            rows={cellRect.bottom - cellRect.top}
            cols={cellRect.right - cellRect.left}
            align={commonAlign(info, cellRect)}
            onAlignChange={(align) =>
              tables.alignColumns(
                editor,
                info.pos,
                cellRect.left,
                cellRect.right - 1,
                alignValue(align),
              )
            }
            onClear={() => {
              tables.clearCells(editor, info.pos, cellRect);
              refocus();
            }}
            onDeleteRows={() => {
              const count = cellRect.bottom - cellRect.top;
              setTableDanger(editor, null);
              tables.deleteRows(editor, info.pos, cellRect.top, cellRect.bottom - 1);
              deleted(
                count === info.rows
                  ? 'Table deleted'
                  : count > 1
                    ? `${count} rows deleted`
                    : 'Row deleted',
              );
              refocus();
            }}
            onDeleteColumns={() => {
              const count = cellRect.right - cellRect.left;
              setTableDanger(editor, null);
              tables.deleteColumns(editor, info.pos, cellRect.left, cellRect.right - 1);
              deleted(
                count === info.cols
                  ? 'Table deleted'
                  : count > 1
                    ? `${count} columns deleted`
                    : 'Column deleted',
              );
              refocus();
            }}
            onPreviewChange={(kind) =>
              preview(
                kind === 'rows'
                  ? {
                      tablePos: info.pos,
                      rect: { ...whole, top: cellRect.top, bottom: cellRect.bottom },
                    }
                  : kind === 'columns'
                    ? {
                        tablePos: info.pos,
                        rect: { ...whole, left: cellRect.left, right: cellRect.right },
                      }
                    : null,
              )
            }
          />
        </div>
      )}

      {menuInfo && (
        <DropdownMenu
          open
          onOpenChange={(open, details) => {
            if (!open)
              closeMenu(details.reason !== 'outside-press' && details.reason !== 'focus-out');
          }}
        >
          <TableMenuFor
            menu={menuInfo}
            info={info}
            anchor={menuInfo.axis === 'column' ? columnHandle : rowHandle}
            act={act}
            onDeleted={deleted}
            onPreview={(on) =>
              preview(
                on ? { tablePos: info.pos, rect: menuLine(menuInfo.index, menuInfo.axis) } : null,
              )
            }
            editor={editor}
          />
        </DropdownMenu>
      )}
    </div>
  );
}

// the alignment shared by the columns of `rect`, or null when they differ
function commonAlign(info: tables.TableInfo, rect: Rect): TableAlignment | null {
  let common: TableAlignment | null | undefined;
  for (let col = rect.left; col < rect.right; col += 1) {
    const align = tables.columnAlign(info, col) ?? 'left';
    if (common === undefined) common = align;
    else if (common !== align) return null;
  }
  return common ?? null;
}

// left is a column with no alignment, as Markdown writes it plainly
const alignValue = (align: TableAlignment): tables.TableAlign | null =>
  align === 'left' ? null : align;

function TableMenuFor({
  editor,
  menu,
  info,
  anchor,
  act,
  onDeleted,
  onPreview,
}: {
  editor: Editor;
  menu: MenuState;
  info: tables.TableInfo;
  anchor: RefObject<HTMLButtonElement | null>;
  act: (run: () => void) => () => void;
  onDeleted: (title: string) => void;
  onPreview: (on: boolean) => void;
}) {
  const { axis, index } = menu;
  const pos = info.pos;
  const column = axis === 'column';
  const headerRow = !column && info.hasHeader && index === 0;
  const name = column && info.hasHeader ? tables.cellNode(info, 0, index).textContent.trim() : '';
  const label = column
    ? name
      ? `Column · ${name}`
      : `Column ${index + 1}`
    : headerRow
      ? 'Header row'
      : `Row ${info.hasHeader ? index : index + 1}`;
  const first = column ? 0 : info.hasHeader ? 1 : 0;
  const last = (column ? info.cols : info.rows) - 1;
  const deleteAll = column ? info.cols === 1 : info.rows === 1;
  return (
    <TableMenu
      anchor={anchor}
      axis={axis}
      label={label}
      headerRow={headerRow}
      alignment={column ? (tables.columnAlign(info, index) ?? 'left') : undefined}
      onAlignmentChange={(align) => {
        // the menu stays open, so its column stays selected
        tables.alignColumns(editor, pos, index, index, alignValue(align));
        tables.selectLine(editor, pos, axis, index);
      }}
      numeric={column && tables.isNumericColumn(info, index)}
      onSort={(direction) => act(() => tables.sortByColumn(editor, pos, index, direction))()}
      onInsertBefore={act(() =>
        column
          ? tables.insertColumn(editor, pos, index, 0)
          : tables.insertRow(editor, pos, index, 0),
      )}
      onInsertAfter={act(() =>
        column
          ? tables.insertColumn(editor, pos, index + 1, 0)
          : tables.insertRow(editor, pos, index + 1, 0),
      )}
      onMoveBefore={
        index > first && !headerRow
          ? act(() =>
              column
                ? tables.moveColumn(editor, pos, index, index - 1, 0)
                : tables.moveRow(editor, pos, index, index - 1, 0),
            )
          : undefined
      }
      onMoveAfter={
        index < last && !headerRow
          ? act(() =>
              column
                ? tables.moveColumn(editor, pos, index, index + 1, 0)
                : tables.moveRow(editor, pos, index, index + 1, 0),
            )
          : undefined
      }
      onDuplicate={act(() =>
        column
          ? tables.duplicateColumn(editor, pos, index)
          : tables.duplicateRow(editor, pos, index),
      )}
      onToggleHeader={act(() => tables.toggleHeaderRow(editor, pos))}
      onClear={act(() => {
        const rect = column
          ? { left: index, right: index + 1, top: 0, bottom: info.rows }
          : { left: 0, right: info.cols, top: index, bottom: index + 1 };
        tables.clearCells(editor, pos, rect, { keepHeader: column });
        tables.focusCell(editor, pos, column ? 0 : index, column ? index : 0);
      })}
      onDelete={act(() => {
        if (column) tables.deleteColumns(editor, pos, index, index);
        else tables.deleteRows(editor, pos, index, index);
        onDeleted(deleteAll ? 'Table deleted' : column ? 'Column deleted' : 'Row deleted');
      })}
      onPreviewChange={(kind) => onPreview(kind === 'delete')}
    />
  );
}
