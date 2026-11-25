import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import {
  addColumn,
  addRow,
  CellSelection,
  removeColumn,
  removeRow,
  TableMap,
  type Rect,
  type TableRect,
} from '@tiptap/pm/tables';

/**
 * What the table controls (TableControls.tsx) and the table keys do to a table, by the table's
 * position and its row and column indexes, each as one transaction so ⌘Z undoes it whole.
 *
 * They offer only what a Markdown table can hold (docs/editor.md): one header row, the first; an
 * alignment per column, set on every cell of it (the serializer takes a column's first, in
 * markdown/rules/tables.ts); and no merged cells. A Markdown table never has a cell spanning more
 * than one row or column, so these take every cell as one slot of the grid.
 */

export type TableAlign = 'left' | 'center' | 'right';

export interface TableInfo {
  /** the table node's position */
  pos: number;
  /** its first row's position */
  start: number;
  node: ProseMirrorNode;
  map: TableMap;
  rows: number;
  cols: number;
  /** the first row is the header (any header cell in it makes it one, as the serializer reads it) */
  hasHeader: boolean;
}

const isTable = (node: ProseMirrorNode | null | undefined): node is ProseMirrorNode =>
  node?.type.spec.tableRole === 'table';

/** The table at `pos`, or null when there is none there. */
export function tableAt(doc: ProseMirrorNode, pos: number): TableInfo | null {
  const node = pos >= 0 && pos < doc.content.size ? doc.nodeAt(pos) : null;
  if (!isTable(node) || node.childCount === 0) return null;
  const map = TableMap.get(node);
  let hasHeader = false;
  node.firstChild!.forEach((cell) => {
    if (cell.type.spec.tableRole === 'header_cell') hasHeader = true;
  });
  return { pos, start: pos + 1, node, map, rows: map.height, cols: map.width, hasHeader };
}

/** The table the selection is in, or null. */
export function tableAround(state: EditorState): TableInfo | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (isTable($from.node(depth))) return tableAt(state.doc, $from.before(depth));
  }
  return null;
}

/** A cell's position. */
export function cellPos(table: TableInfo, row: number, col: number): number {
  return table.start + table.map.map[row * table.cols + col];
}

export function cellNode(table: TableInfo, row: number, col: number): ProseMirrorNode {
  return table.node.nodeAt(table.map.map[row * table.cols + col])!;
}

/** The row and column of the cell the selection's head is in, or null outside a table's cells. */
export function selectedCell(
  state: EditorState,
  table: TableInfo,
): { row: number; col: number } | null {
  const { selection } = state;
  const pos = selection instanceof CellSelection ? selection.$headCell.pos : selection.$head.pos;
  if (pos <= table.start || pos >= table.pos + table.node.nodeSize - 1) return null;
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const role = $pos.node(depth).type.spec.tableRole;
    if (role === 'cell' || role === 'header_cell') {
      if ($pos.before(depth - 2) !== table.pos) return null; // a cell of a table inside this one
      const rect = table.map.findCell($pos.before(depth) - table.start);
      return { row: rect.top, col: rect.left };
    }
  }
  if (selection instanceof CellSelection) {
    const rect = table.map.findCell(pos - table.start);
    return { row: rect.top, col: rect.left };
  }
  return null;
}

/** The cells a CellSelection in this table covers, or null. */
export function selectedRect(state: EditorState, table: TableInfo): Rect | null {
  const { selection } = state;
  if (!(selection instanceof CellSelection)) return null;
  if (selection.$anchorCell.before(-1) !== table.pos) return null;
  return table.map.rectBetween(
    selection.$anchorCell.pos - table.start,
    selection.$headCell.pos - table.start,
  );
}

/** A column's alignment: its first aligned cell's, as the serializer reads it. */
export function columnAlign(table: TableInfo, col: number): TableAlign | null {
  for (let row = 0; row < table.rows; row += 1) {
    const align = cellNode(table, row, col).attrs.align as TableAlign | null | undefined;
    if (align) return align;
  }
  return null;
}

const NUMBER = /^[-+]?[$€£]?\d[\d,]*(?:\.\d+)?%?$|^[-+]?[$€£]?\.\d+%?$/;
const numberOf = (text: string) => Number.parseFloat(text.replace(/[,$€£%]/g, ''));

/** Whether a column's body cells hold numbers, for sorting it 0 → 9 rather than A → Z. */
export function isNumericColumn(table: TableInfo, col: number): boolean {
  let any = false;
  for (let row = table.hasHeader ? 1 : 0; row < table.rows; row += 1) {
    const text = cellNode(table, row, col).textContent.trim();
    if (!text) continue;
    if (!NUMBER.test(text)) return false;
    any = true;
  }
  return any;
}

function rectOf(table: TableInfo, doc: ProseMirrorNode): TableRect {
  const node = doc.nodeAt(table.pos)!;
  return {
    map: TableMap.get(node),
    table: node,
    tableStart: table.pos + 1,
    left: 0,
    top: 0,
    right: table.cols,
    bottom: table.rows,
  };
}

// a caret at the end of a cell's text
function caretIn(tr: Transaction, tablePos: number, row: number, col: number): Transaction {
  const table = tableAt(tr.doc, tablePos);
  if (!table) return tr;
  const r = Math.max(0, Math.min(row, table.rows - 1));
  const c = Math.max(0, Math.min(col, table.cols - 1));
  const pos = cellPos(table, r, c);
  const end = pos + cellNode(table, r, c).nodeSize - 1;
  return tr.setSelection(TextSelection.near(tr.doc.resolve(end), -1));
}

// runs `build` on a transaction of the editor's state and dispatches it when it returns true
function run(editor: Editor, build: (tr: Transaction, state: EditorState) => boolean): boolean {
  const { state } = editor.view;
  const tr = state.tr;
  if (!build(tr, state)) return false;
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function current(editor: Editor, tablePos: number): TableInfo | null {
  return tableAt(editor.state.doc, tablePos);
}

/** Where to put the caret afterwards: in a cell, or nowhere (the selection is left as it is). */
export interface CaretTarget {
  row: number;
  col: number;
}

/**
 * Inserts an empty row at `index`. Under a header row at the least: a row above it would take
 * its place as the first row, and the table would lose its header.
 */
export function insertRow(
  editor: Editor,
  tablePos: number,
  index: number,
  caretCol?: number,
): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  const at = Math.max(table.hasHeader ? 1 : 0, Math.min(index, table.rows));
  return run(editor, (tr) => {
    addRow(tr, rectOf(table, tr.doc), at);
    if (caretCol !== undefined) caretIn(tr, tablePos, at, caretCol);
    return true;
  });
}

/** Inserts an empty column at `index`; its header cell is a header cell. */
export function insertColumn(
  editor: Editor,
  tablePos: number,
  index: number,
  caretRow?: number,
): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  const at = Math.max(0, Math.min(index, table.cols));
  return run(editor, (tr) => {
    addColumn(tr, rectOf(table, tr.doc), at);
    if (caretRow !== undefined) caretIn(tr, tablePos, caretRow, at);
    return true;
  });
}

/** Deletes rows `from` to `to`; all of them deletes the table. */
export function deleteRows(editor: Editor, tablePos: number, from: number, to: number): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  if (from <= 0 && to >= table.rows - 1) return deleteTable(editor, tablePos);
  return run(editor, (tr) => {
    // bottom up, with the table read again after each, as prosemirror-tables' deleteRow does
    for (let row = to; row >= from; row -= 1) removeRow(tr, rectOf(table, tr.doc), row);
    caretIn(tr, tablePos, Math.min(from, table.rows - 1 - (to - from + 1)), 0);
    return true;
  });
}

/** Deletes columns `from` to `to`; all of them deletes the table. */
export function deleteColumns(editor: Editor, tablePos: number, from: number, to: number): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  if (from <= 0 && to >= table.cols - 1) return deleteTable(editor, tablePos);
  return run(editor, (tr) => {
    for (let col = to; col >= from; col -= 1) removeColumn(tr, rectOf(table, tr.doc), col);
    caretIn(tr, tablePos, 0, Math.min(from, table.cols - 1 - (to - from + 1)));
    return true;
  });
}

export function deleteTable(editor: Editor, tablePos: number): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  return run(editor, (tr) => {
    tr.delete(table.pos, table.pos + table.node.nodeSize);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(table.pos, tr.doc.content.size))));
    return true;
  });
}

/**
 * Moves row `from` to `to`, the indexes as they are before the move. The header row stays first:
 * it is never moved, and no row is moved above it.
 */
export function moveRow(
  editor: Editor,
  tablePos: number,
  from: number,
  to: number,
  caretCol?: number,
): boolean {
  const table = current(editor, tablePos);
  if (!table || from === to) return false;
  if (to < 0 || to >= table.rows || from < 0 || from >= table.rows) return false;
  if (table.hasHeader && (from === 0 || to === 0)) return false;
  const rows: ProseMirrorNode[] = [];
  table.node.forEach((row) => rows.push(row));
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved);
  return replaceTable(
    editor,
    table,
    rows,
    caretCol === undefined ? undefined : { row: to, col: caretCol },
  );
}

/** Moves column `from` to `to`, the indexes as they are before the move. */
export function moveColumn(
  editor: Editor,
  tablePos: number,
  from: number,
  to: number,
  caretRow?: number,
): boolean {
  const table = current(editor, tablePos);
  if (!table || from === to) return false;
  if (to < 0 || to >= table.cols || from < 0 || from >= table.cols) return false;
  const rows: ProseMirrorNode[] = [];
  table.node.forEach((row) => {
    const cells: ProseMirrorNode[] = [];
    row.forEach((cell) => cells.push(cell));
    const [moved] = cells.splice(from, 1);
    cells.splice(to, 0, moved);
    rows.push(row.type.create(row.attrs, cells));
  });
  return replaceTable(
    editor,
    table,
    rows,
    caretRow === undefined ? undefined : { row: caretRow, col: to },
  );
}

// puts the table back with `rows`, as one step (prosemirror-tables' own moves read the selection
// to find their rows, so they fail with the caret outside the table, as during a drag)
function replaceTable(
  editor: Editor,
  table: TableInfo,
  rows: ProseMirrorNode[],
  caret?: CaretTarget,
): boolean {
  const node = table.node.type.create(table.node.attrs, rows);
  return run(editor, (tr) => {
    tr.replaceWith(table.pos, table.pos + table.node.nodeSize, node);
    if (caret) caretIn(tr, table.pos, caret.row, caret.col);
    return true;
  });
}

/** Puts a copy of a body row under it. */
export function duplicateRow(editor: Editor, tablePos: number, row: number): boolean {
  const table = current(editor, tablePos);
  if (!table || (table.hasHeader && row === 0)) return false;
  return run(editor, (tr) => {
    let pos = table.start;
    for (let i = 0; i <= row; i += 1) pos += table.node.child(i).nodeSize;
    const original = table.node.child(row);
    tr.insert(pos, original.type.create(original.attrs, original.content));
    return true;
  });
}

/** Puts a copy of a column to its right, its header cell and alignment included. */
export function duplicateColumn(editor: Editor, tablePos: number, col: number): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  return run(editor, (tr) => {
    for (let row = 0; row < table.rows; row += 1) {
      const cell = cellNode(table, row, col);
      tr.insert(
        tr.mapping.map(cellPos(table, row, col) + cell.nodeSize),
        cell.type.create(cell.attrs, cell.content),
      );
    }
    return true;
  });
}

/**
 * Empties the cells in `rect`. `keepHeader` leaves the header row's cells, so clearing a column
 * keeps its name.
 */
export function clearCells(
  editor: Editor,
  tablePos: number,
  rect: Rect,
  { keepHeader = false }: { keepHeader?: boolean } = {},
): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  const paragraph = editor.schema.nodes.paragraph;
  return run(editor, (tr) => {
    let changed = false;
    // last first, so the positions before it stay as they are
    for (let row = rect.bottom - 1; row >= rect.top; row -= 1) {
      if (keepHeader && table.hasHeader && row === 0) continue;
      for (let col = rect.right - 1; col >= rect.left; col -= 1) {
        const cell = cellNode(table, row, col);
        if (
          cell.childCount === 1 &&
          cell.firstChild!.type === paragraph &&
          cell.firstChild!.content.size === 0
        )
          continue;
        const pos = cellPos(table, row, col);
        tr.replaceWith(pos + 1, pos + cell.nodeSize - 1, paragraph.create());
        changed = true;
      }
    }
    return changed;
  });
}

/**
 * Sorts the body rows by a column: numbers by value when every filled cell is one, otherwise by
 * text, with numbers in text compared as numbers ("item 2" before "item 10"). Empty cells go last
 * either way; rows that compare equal keep their order.
 */
export function sortByColumn(
  editor: Editor,
  tablePos: number,
  col: number,
  direction: 'ascending' | 'descending',
): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  const numeric = isNumericColumn(table, col);
  const sign = direction === 'ascending' ? 1 : -1;
  const rows: { node: ProseMirrorNode; text: string }[] = [];
  table.node.forEach((node, _offset, index) => {
    if (!(table.hasHeader && index === 0)) {
      rows.push({ node, text: cellNode(table, index, col).textContent.trim() });
    }
  });
  const sorted = [...rows].sort((a, b) => {
    if (!a.text || !b.text) return Number(!a.text) - Number(!b.text);
    const order = numeric
      ? numberOf(a.text) - numberOf(b.text)
      : a.text.localeCompare(b.text, undefined, { numeric: true, sensitivity: 'base' });
    return order * sign;
  });
  if (sorted.every((row, i) => row === rows[i])) return false;
  const header = table.hasHeader ? [table.node.firstChild!] : [];
  return replaceTable(editor, table, [...header, ...sorted.map((row) => row.node)], {
    row: 0,
    col,
  });
}

/** Aligns columns `from` to `to`: every cell of them, as Markdown keeps one alignment a column. */
export function alignColumns(
  editor: Editor,
  tablePos: number,
  from: number,
  to: number,
  align: TableAlign | null,
): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  return run(editor, (tr) => {
    let changed = false;
    for (let row = 0; row < table.rows; row += 1) {
      for (let col = from; col <= to; col += 1) {
        const cell = cellNode(table, row, col);
        if ((cell.attrs.align ?? null) === align) continue;
        tr.setNodeMarkup(cellPos(table, row, col), undefined, { ...cell.attrs, align });
        changed = true;
      }
    }
    return changed;
  });
}

/** Makes the first row the header, or a body row again. */
export function toggleHeaderRow(editor: Editor, tablePos: number): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  const { tableHeader, tableCell } = editor.schema.nodes;
  const type = table.hasHeader ? tableCell : tableHeader;
  return run(editor, (tr) => {
    for (let col = 0; col < table.cols; col += 1) {
      const cell = cellNode(table, 0, col);
      tr.setNodeMarkup(cellPos(table, 0, col), type, cell.attrs);
    }
    return true;
  });
}

/** Selects a whole row or column, as the handle's menu acts on it. */
export function selectLine(
  editor: Editor,
  tablePos: number,
  axis: 'row' | 'column',
  index: number,
): boolean {
  const table = current(editor, tablePos);
  if (!table) return false;
  return run(editor, (tr) => {
    const [anchor, head] =
      axis === 'row'
        ? [cellPos(table, index, 0), cellPos(table, index, table.cols - 1)]
        : [cellPos(table, 0, index), cellPos(table, table.rows - 1, index)];
    tr.setSelection(CellSelection.create(tr.doc, anchor, head));
    return true;
  });
}

/** Puts the caret at the end of a cell's text. */
export function focusCell(editor: Editor, tablePos: number, row: number, col: number): boolean {
  if (!current(editor, tablePos)) return false;
  return run(editor, (tr) => {
    caretIn(tr, tablePos, row, col);
    return true;
  });
}

/** The table as Markdown, as the note's file holds it. */
export function tableMarkdown(editor: Editor, tablePos: number): string {
  const table = current(editor, tablePos);
  return table ? editor.contentToMarkdown([table.node.toJSON()]) : '';
}
