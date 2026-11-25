import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { Rect } from '@tiptap/pm/tables';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  cellNode,
  cellPos,
  focusCell,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  selectedCell,
  tableAround,
  tableAt,
} from '../table-commands';

/**
 * What the table controls (TableControls.tsx) draw on the table itself, and the table's keys:
 *
 * - the table the selection is in carries `tableActive` on its wrapper, and the cells a delete
 *   would remove, while its button or menu item is pointed at, carry `tableCellDanger`
 *   (`setTableDanger`); EditorContent styles both.
 * - ↵ in a cell goes to the cell below, adding a row under the last; ⇧↵ stays a line break.
 *   ⌘↵ inserts a row below, ⌘⌥← and ⌘⌥→ a column left or right, and ⌥⇧ with an arrow moves the
 *   row or column. Tab and ⇧Tab are TipTap's (Tab in the last cell adds a row).
 */

interface Danger {
  tablePos: number;
  rect: Rect;
}

export const tableControlsKey = new PluginKey<Danger | null>('tableControls');

/** Tints the cells in `rect` as about to be deleted, or clears the tint (null). */
export function setTableDanger(editor: Editor, danger: Danger | null): void {
  if (editor.isDestroyed) return;
  const now = tableControlsKey.getState(editor.state) ?? null;
  if (!now && !danger) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(tableControlsKey, danger).setMeta('addToHistory', false),
  );
}

function decorations(state: EditorState, danger: Danger | null): DecorationSet {
  const decos: Decoration[] = [];
  const active = tableAround(state);
  if (active) {
    decos.push(
      Decoration.node(active.pos, active.pos + active.node.nodeSize, { class: 'tableActive' }),
    );
  }
  const table = danger && tableAt(state.doc, danger.tablePos);
  if (danger && table) {
    const { rect } = danger;
    for (let row = rect.top; row < Math.min(rect.bottom, table.rows); row += 1) {
      for (let col = rect.left; col < Math.min(rect.right, table.cols); col += 1) {
        const pos = cellPos(table, row, col);
        decos.push(
          Decoration.node(pos, pos + cellNode(table, row, col).nodeSize, {
            class: 'tableCellDanger',
          }),
        );
      }
    }
  }
  return decos.length ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
}

// the cell the caret is in, when it is a caret in a cell's paragraph and no "/" or "@" menu is open
function caretCell(editor: Editor) {
  const { state } = editor;
  const { selection } = state;
  if (!selection.empty || editor.storage.editorHost?.menuAria) return null;
  const { $from } = selection;
  const role = $from.depth > 1 ? $from.node(-1).type.spec.tableRole : undefined;
  if ($from.parent.type.name !== 'paragraph' || (role !== 'cell' && role !== 'header_cell')) {
    return null;
  }
  const table = tableAround(state);
  const cell = table && selectedCell(state, table);
  return table && cell ? { table, ...cell } : null;
}

export const TableControlsExtension = Extension.create({
  name: 'tableControls',

  addProseMirrorPlugins() {
    return [
      new Plugin<Danger | null>({
        key: tableControlsKey,
        state: {
          init: () => null,
          apply(tr, danger) {
            const meta = tr.getMeta(tableControlsKey) as Danger | null | undefined;
            if (meta !== undefined) return meta;
            return tr.docChanged ? null : danger;
          },
        },
        props: {
          decorations(state) {
            return decorations(state, tableControlsKey.getState(state) ?? null);
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    const editor = this.editor;
    return {
      Enter: () => {
        const at = caretCell(editor);
        if (!at) return false;
        if (at.row < at.table.rows - 1) return focusCell(editor, at.table.pos, at.row + 1, at.col);
        return insertRow(editor, at.table.pos, at.table.rows, at.col);
      },
      'Mod-Enter': () => {
        const at = caretCell(editor);
        return at ? insertRow(editor, at.table.pos, at.row + 1, at.col) : false;
      },
      'Mod-Alt-ArrowLeft': () => {
        const at = caretCell(editor);
        return at ? insertColumn(editor, at.table.pos, at.col, at.row) : false;
      },
      'Mod-Alt-ArrowRight': () => {
        const at = caretCell(editor);
        return at ? insertColumn(editor, at.table.pos, at.col + 1, at.row) : false;
      },
      'Alt-Shift-ArrowUp': () => {
        const at = caretCell(editor);
        // used even where the row can't move, so the key never reaches the text instead
        if (!at) return false;
        moveRow(editor, at.table.pos, at.row, at.row - 1, at.col);
        return true;
      },
      'Alt-Shift-ArrowDown': () => {
        const at = caretCell(editor);
        if (!at) return false;
        moveRow(editor, at.table.pos, at.row, at.row + 1, at.col);
        return true;
      },
      'Alt-Shift-ArrowLeft': () => {
        const at = caretCell(editor);
        if (!at) return false;
        moveColumn(editor, at.table.pos, at.col, at.col - 1, at.row);
        return true;
      },
      'Alt-Shift-ArrowRight': () => {
        const at = caretCell(editor);
        if (!at) return false;
        moveColumn(editor, at.table.pos, at.col, at.col + 1, at.row);
        return true;
      },
    };
  },
});
