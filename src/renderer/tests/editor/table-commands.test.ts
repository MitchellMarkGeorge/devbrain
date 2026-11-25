import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { EditorHostExtension } from '@renderer/editor/extensions/editor-host';
import {
  TableControlsExtension,
  tableControlsKey,
  setTableDanger,
} from '@renderer/editor/extensions/table-controls';
import { createDocumentExtensions } from '@renderer/editor/markdown';
import {
  alignColumns,
  clearCells,
  columnAlign,
  deleteColumns,
  deleteRows,
  duplicateColumn,
  duplicateRow,
  focusCell,
  insertColumn,
  insertRow,
  isNumericColumn,
  moveColumn,
  moveRow,
  selectedCell,
  selectedRect,
  selectLine,
  sortByColumn,
  tableAround,
  tableAt,
  tableMarkdown,
  toggleHeaderRow,
} from '@renderer/editor/table-commands';

let editor: Editor;

function load(markdown: string) {
  editor?.destroy();
  editor = new Editor({
    extensions: [...createDocumentExtensions(), EditorHostExtension, TableControlsExtension],
    content: markdown,
    contentType: 'markdown',
  });
}

afterEach(() => editor?.destroy());

const TABLE = [
  '| Endpoint   | Method | p95 |',
  '| ---------- | ------ | ---: |',
  '| /v2/tasks  | GET    | 84  |',
  '| /v2/sync   | POST   | 340 |',
  '| /v2/health | GET    | 9   |',
].join('\n');

// the first table's position
function tablePos(): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === 'table') found = pos;
    return found < 0;
  });
  return found;
}

// the table's cells' text, row by row
function grid(): string[][] {
  const table = tableAt(editor.state.doc, tablePos())!;
  const rows: string[][] = [];
  table.node.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => cells.push(cell.textContent));
    rows.push(cells);
  });
  return rows;
}

const markdown = () => editor.contentToMarkdown(editor.getJSON().content ?? []);

// presses a key in the editor, as ProseMirror's keymaps hear it
function press(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  editor.view.someProp('handleKeyDown', (handle) => handle(editor.view, event));
}

describe('reading a table', () => {
  it('finds its size, header, alignments and number columns', () => {
    load(TABLE);
    const table = tableAt(editor.state.doc, tablePos())!;
    expect([table.rows, table.cols, table.hasHeader]).toEqual([4, 3, true]);
    expect([0, 1, 2].map((col) => columnAlign(table, col))).toEqual([null, null, 'right']);
    expect([0, 1, 2].map((col) => isNumericColumn(table, col))).toEqual([false, false, true]);
  });

  it('knows the cell the caret is in', () => {
    load(TABLE);
    focusCell(editor, tablePos(), 2, 1);
    const table = tableAround(editor.state)!;
    expect(selectedCell(editor.state, table)).toEqual({ row: 2, col: 1 });
  });
});

describe('rows', () => {
  it('inserts a row and puts the caret in it', () => {
    load(TABLE);
    insertRow(editor, tablePos(), 2, 1);
    expect(grid()[2]).toEqual(['', '', '']);
    expect(grid()).toHaveLength(5);
    expect(selectedCell(editor.state, tableAround(editor.state)!)).toEqual({ row: 2, col: 1 });
  });

  it('never inserts a row above the header row', () => {
    load(TABLE);
    insertRow(editor, tablePos(), 0);
    expect(grid()[0]).toEqual(['Endpoint', 'Method', 'p95']);
    expect(grid()[1]).toEqual(['', '', '']);
    expect(tableAt(editor.state.doc, tablePos())!.hasHeader).toBe(true);
  });

  it('moves a row, but never the header row or above it', () => {
    load(TABLE);
    expect(moveRow(editor, tablePos(), 3, 1)).toBe(true);
    expect(grid().map((row) => row[0])).toEqual([
      'Endpoint',
      '/v2/health',
      '/v2/tasks',
      '/v2/sync',
    ]);
    expect(moveRow(editor, tablePos(), 1, 0)).toBe(false);
    expect(moveRow(editor, tablePos(), 0, 2)).toBe(false);
  });

  it('duplicates a body row under it', () => {
    load(TABLE);
    duplicateRow(editor, tablePos(), 2);
    expect(grid().map((row) => row[0])).toEqual([
      'Endpoint',
      '/v2/tasks',
      '/v2/sync',
      '/v2/sync',
      '/v2/health',
    ]);
  });

  it('deletes rows; deleting the header row leaves a table without one', () => {
    load(TABLE);
    deleteRows(editor, tablePos(), 1, 2);
    expect(grid().map((row) => row[0])).toEqual(['Endpoint', '/v2/health']);
    deleteRows(editor, tablePos(), 0, 0);
    expect(tableAt(editor.state.doc, tablePos())!.hasHeader).toBe(false);
    expect(markdown()).toBe(
      [
        '|            |     |     |',
        '| ---------- | --- | ---: |',
        '| /v2/health | GET | 9   |',
      ].join('\n'),
    );
  });

  it('deleting every row deletes the table', () => {
    load(`Before\n\n${TABLE}\n\nAfter`);
    deleteRows(editor, tablePos(), 0, 3);
    expect(tablePos()).toBe(-1);
    expect(markdown()).toBe('Before\n\nAfter');
  });
});

describe('columns', () => {
  it('inserts a column with a header cell', () => {
    load(TABLE);
    insertColumn(editor, tablePos(), 1, 0);
    const table = tableAt(editor.state.doc, tablePos())!;
    expect(table.cols).toBe(4);
    expect(table.node.firstChild!.child(1).type.name).toBe('tableHeader');
    expect(selectedCell(editor.state, table)).toEqual({ row: 0, col: 1 });
  });

  it('moves a column with its alignment', () => {
    load(TABLE);
    moveColumn(editor, tablePos(), 2, 0);
    expect(grid()[0]).toEqual(['p95', 'Endpoint', 'Method']);
    expect(columnAlign(tableAt(editor.state.doc, tablePos())!, 0)).toBe('right');
  });

  it('moves with the caret outside the table, as a drag does', () => {
    load(`Intro\n\n${TABLE}`);
    editor.commands.setTextSelection(2);
    expect(moveColumn(editor, tablePos(), 0, 2)).toBe(true);
    expect(grid()[0]).toEqual(['Method', 'p95', 'Endpoint']);
    expect(moveRow(editor, tablePos(), 1, 3)).toBe(true);
    expect(grid().map((row) => row[2])).toEqual([
      'Endpoint',
      '/v2/sync',
      '/v2/health',
      '/v2/tasks',
    ]);
  });

  it('duplicates a column to its right', () => {
    load(TABLE);
    duplicateColumn(editor, tablePos(), 2);
    expect(grid()[1]).toEqual(['/v2/tasks', 'GET', '84', '84']);
    expect(columnAlign(tableAt(editor.state.doc, tablePos())!, 3)).toBe('right');
  });

  it('deletes columns; deleting every column deletes the table', () => {
    load(TABLE);
    deleteColumns(editor, tablePos(), 0, 1);
    expect(grid()[0]).toEqual(['p95']);
    deleteColumns(editor, tablePos(), 0, 0);
    expect(tablePos()).toBe(-1);
  });

  it('aligns every cell of a column, as Markdown keeps it', () => {
    load(TABLE);
    alignColumns(editor, tablePos(), 0, 1, 'center');
    expect(markdown().split('\n')[1]).toBe('| :----------: | :------: | ---: |');
    alignColumns(editor, tablePos(), 0, 1, null);
    expect(markdown()).toBe(TABLE);
  });

  it('sorts body rows by numbers, then by text, keeping the header first', () => {
    load(TABLE);
    sortByColumn(editor, tablePos(), 2, 'ascending');
    expect(grid().map((row) => row[2])).toEqual(['p95', '9', '84', '340']);
    sortByColumn(editor, tablePos(), 0, 'descending');
    expect(grid().map((row) => row[0])).toEqual([
      'Endpoint',
      '/v2/tasks',
      '/v2/sync',
      '/v2/health',
    ]);
  });

  it('sorts empty cells last', () => {
    load(['| A |', '| - |', '| b |', '|   |', '| a |'].join('\n'));
    sortByColumn(editor, tablePos(), 0, 'descending');
    expect(grid().map((row) => row[0])).toEqual(['A', 'b', 'a', '']);
  });
});

describe('the table', () => {
  it('turns the header row off and on', () => {
    load(TABLE);
    toggleHeaderRow(editor, tablePos());
    expect(markdown().split('\n')[0]).toBe('|            |        |     |');
    toggleHeaderRow(editor, tablePos());
    expect(markdown()).toBe(TABLE);
  });

  it('clears cells, keeping a column’s name', () => {
    load(TABLE);
    clearCells(editor, tablePos(), { left: 2, right: 3, top: 0, bottom: 4 }, { keepHeader: true });
    expect(grid().map((row) => row[2])).toEqual(['p95', '', '', '']);
  });

  it('selects a row or a column', () => {
    load(TABLE);
    selectLine(editor, tablePos(), 'column', 1);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    const table = tableAt(editor.state.doc, tablePos())!;
    expect(selectedRect(editor.state, table)).toMatchObject({
      left: 1,
      right: 2,
      top: 0,
      bottom: 4,
    });
  });

  it('gives its Markdown', () => {
    load(`Intro\n\n${TABLE}`);
    expect(tableMarkdown(editor, tablePos())).toBe(TABLE);
  });

  it('undoes each change in one step', () => {
    load(TABLE);
    sortByColumn(editor, tablePos(), 2, 'descending');
    editor.commands.undo();
    expect(markdown()).toBe(TABLE);
  });
});

describe('the table keys', () => {
  it('↵ goes to the cell below, adding a row under the last', () => {
    load(TABLE);
    focusCell(editor, tablePos(), 2, 1);
    press('Enter');
    expect(selectedCell(editor.state, tableAround(editor.state)!)).toEqual({ row: 3, col: 1 });
    press('Enter');
    expect(grid()).toHaveLength(5);
    expect(selectedCell(editor.state, tableAround(editor.state)!)).toEqual({ row: 4, col: 1 });
  });

  it('⌘↵ inserts a row below, ⌥⇧↑ moves the row up', () => {
    load(TABLE);
    focusCell(editor, tablePos(), 3, 0);
    press('ArrowUp', { altKey: true, shiftKey: true });
    expect(grid().map((row) => row[0])).toEqual([
      'Endpoint',
      '/v2/tasks',
      '/v2/health',
      '/v2/sync',
    ]);
    press('Enter', /Mac/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true });
    expect(grid()[3]).toEqual(['', '', '']);
  });
});

describe('the delete tint', () => {
  it('marks the cells a delete would remove, until the document changes', () => {
    load(TABLE);
    setTableDanger(editor, {
      tablePos: tablePos(),
      rect: { left: 0, right: 3, top: 1, bottom: 2 },
    });
    const dom = editor.view.dom;
    expect(dom.querySelectorAll('.tableCellDanger')).toHaveLength(3);
    focusCell(editor, tablePos(), 1, 0);
    editor.commands.insertContent('x');
    expect(tableControlsKey.getState(editor.state)).toBeNull();
    expect(dom.querySelectorAll('.tableCellDanger')).toHaveLength(0);
  });
});
