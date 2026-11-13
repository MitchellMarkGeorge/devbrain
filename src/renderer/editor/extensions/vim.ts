import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import { MODE_ATTRIBUTE, MODE_CHANGE_EVENT } from '../../keyboard/keymap';

/** The editor's Vim modes (Figma `7714:56193`–`7714:56845`). */
export type EditorVimMode = 'normal' | 'insert' | 'visual' | 'visual-line';

interface VimState {
  mode: EditorVimMode;
  /** the count typed so far (`3` of `3j`) */
  count: string;
  /** an operator or prefix waiting for its next key (`d` of `dd`, `g` of `gg`) */
  pending: string;
  /** where a Visual selection started */
  anchor: number;
  /** where the cursor is in Visual: the selection's moving end, which `j`/`k` move from */
  cursor: number;
}

declare module '@tiptap/core' {
  interface Storage {
    // enabled: Vim keys are on (the app's keyboardMode); off, the plugin does nothing
    // register: what `yy`, `dd` and a Visual `y`/`d` took, for `p`
    vim: { enabled: boolean; register: Slice | null };
  }
}

export const vimKey = new PluginKey<VimState>('vim');

const INITIAL: VimState = { mode: 'normal', count: '', pending: '', anchor: 0, cursor: 0 };

/**
 * Turns Vim keys on or off in `editor` (`RichTextEditor` follows its `vim`); the plugin draws, or
 * stops drawing, its cursor and mode at once.
 */
export function setVimEnabled(editor: Editor, enabled: boolean): void {
  if (editor.isDestroyed || editor.storage.vim.enabled === enabled) return;
  editor.storage.vim.enabled = enabled;
  editor.view.dispatch(editor.state.tr.setMeta(vimKey, {}));
}

/** The editor's Vim mode now, or `null` while Vim keys are off. */
export function editorVimMode(editor: Editor): EditorVimMode | null {
  if (!editor.storage.vim?.enabled) return null;
  return vimKey.getState(editor.state)?.mode ?? null;
}

// ---------- lines: the document's textblocks, in order ----------

interface Line {
  /** the position before the textblock */
  pos: number;
  node: PMNode;
  /** where its text starts and ends */
  start: number;
  end: number;
}

function linesOf(doc: PMNode): Line[] {
  const lines: Line[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    lines.push({ pos, node, start: pos + 1, end: pos + 1 + node.content.size });
    return false;
  });
  return lines;
}

function lineIndexAt(lines: Line[], pos: number): number {
  let found = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].pos <= pos) found = i;
    else break;
  }
  return found;
}

// the last position the Normal cursor can sit on: on the last character, not after it
function lastColumn(line: Line, after = false): number {
  return after || line.end === line.start ? line.end : line.end - 1;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * The range a line (`dd`, `yy`, `V`) covers: its list item when it is one's first block, and the
 * whole list (or quote) when that is all it holds, so deleting it leaves no empty list behind.
 */
function lineRange(state: EditorState, line: Line): { from: number; to: number } {
  const $pos = state.doc.resolve(line.start);
  let depth = $pos.depth;
  for (let d = $pos.depth - 1; d > 0; d -= 1) {
    if (/^(listItem|taskItem)$/.test($pos.node(d).type.name)) {
      if ($pos.index(d) === 0) depth = d;
      break;
    }
  }
  while (depth > 1 && $pos.node(depth - 1).childCount === 1) depth -= 1;
  return { from: $pos.before(depth), to: $pos.after(depth) };
}

// ---------- word motions, over a line's text ----------

const WORD = /[\p{L}\p{N}_]/u;
const kind = (char: string | undefined) =>
  char === undefined ? 0 : /\s/.test(char) ? 0 : WORD.test(char) ? 1 : 2;

function textOf(state: EditorState, line: Line): string {
  return state.doc.textBetween(line.start, line.end, '\n', '￼');
}

/** `w`: the start of the next word, on this line or the next. */
function nextWordStart(state: EditorState, lines: Line[], head: number): number {
  let index = lineIndexAt(lines, head);
  let column = head - lines[index].start;
  let text = textOf(state, lines[index]);
  const here = kind(text[column]);
  while (column < text.length && here !== 0 && kind(text[column]) === here) column += 1;
  for (;;) {
    while (column < text.length && kind(text[column]) === 0) column += 1;
    if (column < text.length || index === lines.length - 1) {
      return lines[index].start + Math.min(column, Math.max(0, text.length - 1));
    }
    index += 1;
    column = 0;
    text = textOf(state, lines[index]);
    if (text.length === 0) return lines[index].start;
  }
}

/** `b`: the start of this word, or of the one before. */
function previousWordStart(state: EditorState, lines: Line[], head: number): number {
  let index = lineIndexAt(lines, head);
  let column = head - lines[index].start;
  let text = textOf(state, lines[index]);
  column -= 1;
  for (;;) {
    while (column >= 0 && kind(text[column]) === 0) column -= 1;
    if (column >= 0) break;
    if (index === 0) return lines[0].start;
    index -= 1;
    text = textOf(state, lines[index]);
    column = text.length - 1;
    if (text.length === 0) return lines[index].start;
  }
  const word = kind(text[column]);
  while (column > 0 && kind(text[column - 1]) === word) column -= 1;
  return lines[index].start + column;
}

/** `e`: the end of this word, or of the next. */
function wordEnd(state: EditorState, lines: Line[], head: number): number {
  let index = lineIndexAt(lines, head);
  let column = head - lines[index].start + 1;
  let text = textOf(state, lines[index]);
  for (;;) {
    while (column < text.length && kind(text[column]) === 0) column += 1;
    if (column < text.length) break;
    if (index === lines.length - 1) return lastColumn(lines[index]);
    index += 1;
    column = 0;
    text = textOf(state, lines[index]);
  }
  const word = kind(text[column]);
  while (column + 1 < text.length && kind(text[column + 1]) === word) column += 1;
  return lines[index].start + column;
}

// ---------- the plugin ----------

function setVim(view: EditorView, change: Partial<VimState>, selection?: TextSelection): void {
  const tr = view.state.tr.setMeta(vimKey, change);
  if (selection) tr.setSelection(selection);
  view.dispatch(tr.scrollIntoView());
}

/**
 * Vim keys in the rich text editor: Normal, Visual, Visual line and Insert, as Figma's editor
 * frames show (`7714:56193` to `7714:56845`). It does nothing until `editor.storage.vim.enabled`
 * is set (`RichTextEditor`'s `vim`), and in Insert mode it leaves every key to TipTap, Esc aside
 * (`VimInsertEscape`, which runs after the `/` and `@` menus and the link editor have had theirs).
 *
 * - **Normal** (where it starts, and where focus coming in puts it): a block cursor on the
 *   character, relative line numbers; `h`/`j`/`k`/`l`, `w`/`b`/`e`, `0`/`^`/`$`, `gg`/`G`, with
 *   counts; `x`, `dd`, `yy`, `p`/`P`; `i`, `a`, `I`, `A`, `o`, `O` into Insert; `v` and `V`;
 *   `u` and `Ctrl-r` undo and redo. Esc leaves the editor, and the app's keys work again.
 * - **Visual** (`v`) and **Visual line** (`V`): the motions grow the selection; `d` or `x` deletes
 *   it, `y` copies it, `>` and `<` nest and un-nest list items, Esc goes back to Normal.
 *
 * The mode is the editor's `data-key-mode`, which the app's dispatcher reads (and is told of
 * with a `MODE_CHANGE_EVENT`), so the mode line shows it.
 */
export const VimMode = Extension.create({
  name: 'vim',
  // before every other extension's keys, so Normal mode's letters never reach them
  priority: 1000,

  addStorage() {
    return { enabled: false, register: null as Slice | null };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const enabled = () => editor.storage.vim.enabled;
    return [
      new Plugin<VimState>({
        key: vimKey,
        state: {
          init: () => INITIAL,
          apply: (tr, value) => {
            const change = tr.getMeta(vimKey) as Partial<VimState> | undefined;
            return change ? { ...value, ...change } : value;
          },
        },
        view: () => {
          let last: EditorVimMode | null = null;
          return {
            update: (view) => {
              const mode = enabled() ? (vimKey.getState(view.state)?.mode ?? null) : null;
              if (mode === last) return;
              last = mode;
              view.dom.dispatchEvent(
                new CustomEvent(MODE_CHANGE_EVENT, { bubbles: true, detail: mode }),
              );
            },
          };
        },
        props: {
          attributes: (state): Record<string, string> => {
            if (!enabled()) return {};
            return { [MODE_ATTRIBUTE]: vimKey.getState(state)?.mode ?? 'normal' };
          },
          decorations: (state) => (enabled() ? decorate(state) : null),
          handleDOMEvents: {
            // focus coming back finds Normal mode, as it left
            blur: (view) => {
              const vim = vimKey.getState(view.state);
              if (enabled() && vim && vim.mode !== 'normal') {
                setVim(view, { mode: 'normal', count: '', pending: '' });
              }
              return false;
            },
          },
          handleKeyDown: (view, event) => {
            if (!enabled() || event.isComposing) return false;
            const vim = vimKey.getState(view.state) ?? INITIAL;
            if (vim.mode === 'insert') return false;
            return handleNormal(editor, view, vim, event);
          },
        },
      }),
    ];
  },
});

/** Insert mode's Esc: back to Normal, the cursor one back, after the menus have had their Esc. */
export const VimInsertEscape = Extension.create({
  name: 'vimInsertEscape',
  priority: 1,
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (!editor.storage.vim?.enabled || event.key !== 'Escape' || event.isComposing) {
              return false;
            }
            const vim = vimKey.getState(view.state);
            if (vim?.mode !== 'insert') return false;
            const lines = linesOf(view.state.doc);
            const head = view.state.selection.head;
            const line = lines[lineIndexAt(lines, head)];
            const to = line ? clamp(head - 1, line.start, lastColumn(line)) : head;
            setVim(view, { mode: 'normal' }, TextSelection.create(view.state.doc, to));
            return true;
          },
        },
      }),
    ];
  },
});

// ---------- drawing: the block cursor and relative line numbers ----------

function decorate(state: EditorState): DecorationSet | null {
  const vim = vimKey.getState(state);
  if (!vim || vim.mode === 'insert') return null;
  const lines = linesOf(state.doc);
  if (lines.length === 0) return null;
  const head = vim.mode === 'normal' ? state.selection.head : vim.cursor;
  const current = lineIndexAt(lines, head);
  const decorations: Decoration[] = lines.map((line, i) =>
    Decoration.node(line.pos, line.pos + line.node.nodeSize, {
      'data-vim-line': String(i === current ? i + 1 : Math.abs(i - current)),
      ...(i === current ? { 'data-vim-current': '' } : {}),
    }),
  );
  {
    const line = lines[current];
    decorations.push(
      head < line.end
        ? Decoration.inline(head, head + 1, { class: 'vim-cursor' })
        : Decoration.widget(head, () => {
            const cursor = document.createElement('span');
            cursor.className = 'vim-cursor vim-cursor-empty';
            return cursor;
          }),
    );
  }
  return DecorationSet.create(state.doc, decorations);
}

// ---------- Normal and Visual mode keys ----------

function handleNormal(
  editor: Editor,
  view: EditorView,
  vim: VimState,
  event: KeyboardEvent,
): boolean {
  const { key } = event;
  // the app's and TipTap's chords (⌘B, ⌘\) pass; Ctrl-r is redo
  if (event.metaKey || event.altKey || (event.ctrlKey && key !== 'r')) return false;
  const state = view.state;
  const lines = linesOf(state.doc);
  if (lines.length === 0) return false;
  const visual = vim.mode === 'visual' || vim.mode === 'visual-line';
  const head = visual ? visualHead(state, vim) : state.selection.head;
  const index = lineIndexAt(lines, head);
  const line = lines[index];

  if (key === 'Escape') {
    if (visual) {
      const lineEnd = lastColumn(line);
      setVim(
        view,
        { mode: 'normal', count: '', pending: '' },
        TextSelection.create(state.doc, Math.min(head, lineEnd)),
      );
    } else if (vim.count || vim.pending) {
      setVim(view, { count: '', pending: '' });
    } else {
      // Normal's Esc leaves the editor: focus goes out, and the app's keys work again
      view.dom.blur();
    }
    return true;
  }

  // a count (a leading 0 is "start of line")
  if (/^[0-9]$/.test(key) && !(key === '0' && vim.count === '') && !vim.pending) {
    setVim(view, { count: vim.count + key });
    return true;
  }
  const count = Math.max(1, Number(vim.count || '1'));
  const typed = vim.pending + key;

  // where the cursor goes for a motion, or null when the key isn't one
  const motion = (): number | null => {
    const after = visual;
    switch (typed) {
      case 'h':
      case 'ArrowLeft':
      case 'Backspace':
        return clamp(head - count, line.start, lastColumn(line, after));
      case 'l':
      case 'ArrowRight':
      case ' ':
        return clamp(head + count, line.start, lastColumn(line, after));
      case 'j':
      case 'k':
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter': {
        const down = typed === 'j' || typed === 'ArrowDown' || typed === 'Enter';
        const target = lines[clamp(index + (down ? count : -count), 0, lines.length - 1)];
        const column = typed === 'Enter' ? 0 : head - line.start;
        return clamp(target.start + column, target.start, lastColumn(target, after));
      }
      case '0':
      case 'Home':
        return line.start;
      case '^': {
        const text = textOf(state, line);
        return line.start + Math.max(0, text.search(/\S/));
      }
      case '$':
      case 'End':
        return lastColumn(line, after);
      case 'w':
      case 'b':
      case 'e': {
        let to = head;
        for (let i = 0; i < count; i += 1) {
          to =
            typed === 'w'
              ? nextWordStart(state, lines, to)
              : typed === 'b'
                ? previousWordStart(state, lines, to)
                : wordEnd(state, lines, to);
        }
        return to;
      }
      case 'gg':
        return lines[vim.count ? clamp(count - 1, 0, lines.length - 1) : 0].start;
      case 'G':
        return lines[vim.count ? clamp(count - 1, 0, lines.length - 1) : lines.length - 1].start;
      default:
        return null;
    }
  };

  const to = motion();
  if (to !== null) {
    if (visual) setVisual(view, vim, to);
    else setVim(view, { count: '', pending: '' }, TextSelection.create(state.doc, to));
    return true;
  }

  // keys that wait for another: gg, dd, yy, and Visual's nothing
  if ((key === 'g' || (!visual && (key === 'd' || key === 'y'))) && vim.pending === '') {
    setVim(view, { pending: key });
    return true;
  }

  const done = (change: Partial<VimState> = {}) => ({ count: '', pending: '', ...change });

  if (visual) return handleVisual(editor, view, vim, typed, done);

  switch (typed) {
    case 'i':
      setVim(view, done({ mode: 'insert' }));
      return true;
    case 'a':
      setVim(
        view,
        done({ mode: 'insert' }),
        TextSelection.create(state.doc, Math.min(head + 1, line.end)),
      );
      return true;
    case 'I':
      setVim(view, done({ mode: 'insert' }), TextSelection.create(state.doc, line.start));
      return true;
    case 'A':
      setVim(view, done({ mode: 'insert' }), TextSelection.create(state.doc, line.end));
      return true;
    case 'o':
    case 'O': {
      // a new line after (or before) this one, of its kind (a list item in a list), in Insert
      const below = typed === 'o';
      setVim(
        view,
        done({ mode: 'insert' }),
        TextSelection.create(state.doc, below ? line.end : line.start),
      );
      editor.commands.enter();
      if (!below) {
        const now = linesOf(editor.state.doc);
        const above =
          now[clamp(lineIndexAt(now, editor.state.selection.head) - 1, 0, now.length - 1)];
        editor.commands.setTextSelection(above.start);
      }
      return true;
    }
    case 'v':
    case 'V': {
      const mode = typed === 'v' ? 'visual' : 'visual-line';
      setVisual(view, { ...vim, mode, anchor: head }, head, { mode, anchor: head });
      return true;
    }
    case 'x': {
      const end = Math.min(head + count, line.end);
      if (end > head) {
        const tr = state.tr.delete(head, end);
        const now = linesOf(tr.doc)[index];
        tr.setSelection(TextSelection.create(tr.doc, clamp(head, now.start, lastColumn(now))));
        view.dispatch(closeHistory(tr).setMeta(vimKey, done()));
      } else {
        setVim(view, done());
      }
      return true;
    }
    case 'dd':
    case 'yy': {
      const last = lines[clamp(index + count - 1, 0, lines.length - 1)];
      const from = lineRange(state, line).from;
      const to = lineRange(state, last).to;
      editor.storage.vim.register = state.doc.slice(from, to);
      copyText(state.doc.textBetween(from, to, '\n', '￼'));
      if (typed === 'yy') {
        setVim(view, done());
        return true;
      }
      const tr = state.tr.delete(from, to);
      if (tr.doc.content.size === 0 || linesOf(tr.doc).length === 0) {
        tr.insert(0, state.schema.nodes.paragraph.create());
      }
      const now = linesOf(tr.doc);
      const at = now[clamp(index, 0, now.length - 1)];
      tr.setSelection(TextSelection.create(tr.doc, at.start));
      // each change is an undo step of its own (`u`), however soon the next comes
      view.dispatch(closeHistory(tr).setMeta(vimKey, done()).scrollIntoView());
      return true;
    }
    case 'p':
    case 'P': {
      const register = editor.storage.vim.register;
      if (register) {
        const range = lineRange(state, line);
        const at = typed === 'p' ? range.to : range.from;
        const tr = state.tr;
        try {
          tr.replace(at, at, new Slice(Fragment.from(register.content), 0, 0));
        } catch {
          tr.insertText(register.content.textBetween(0, register.content.size, '\n'), at);
        }
        const now = linesOf(tr.doc);
        const pasted = now[clamp(lineIndexAt(now, at + 1), 0, now.length - 1)];
        tr.setSelection(TextSelection.create(tr.doc, pasted.start));
        // each change is an undo step of its own (`u`), however soon the next comes
        view.dispatch(closeHistory(tr).setMeta(vimKey, done()).scrollIntoView());
      } else {
        setVim(view, done());
      }
      return true;
    }
    case 'u':
      for (let i = 0; i < count; i += 1) editor.commands.undo();
      setVim(view, done());
      return true;
    case 'r':
      if (event.ctrlKey) {
        for (let i = 0; i < count; i += 1) editor.commands.redo();
        setVim(view, done());
        return true;
      }
      break;
  }
  // anything else typed in Normal mode is not text: it is dropped
  if (key.length === 1 || vim.pending) {
    setVim(view, done());
    return true;
  }
  return false;
}

// Visual's moving end: where the cursor is
function visualHead(state: EditorState, vim: VimState): number {
  return clamp(vim.cursor, 0, state.doc.content.size);
}

/**
 * Moves Visual's cursor to `to` and selects from where it started: the characters between,
 * inclusive of the one under the cursor (as Vim's), or whole lines in Visual line.
 */
function setVisual(
  view: EditorView,
  vim: VimState,
  to: number,
  change: Partial<VimState> = {},
): void {
  const doc = view.state.doc;
  const lines = linesOf(doc);
  const anchor = vim.anchor;
  let selection: TextSelection;
  if (vim.mode === 'visual-line') {
    const a = lineIndexAt(lines, anchor);
    const b = lineIndexAt(lines, to);
    selection =
      a <= b
        ? TextSelection.create(doc, lines[a].start, lines[b].end)
        : TextSelection.create(doc, lines[a].end, lines[b].start);
  } else {
    const line = lines[lineIndexAt(lines, to)];
    const anchorLine = lines[lineIndexAt(lines, anchor)];
    selection =
      to >= anchor
        ? TextSelection.create(doc, anchor, Math.min(to + 1, line.end))
        : TextSelection.create(doc, Math.min(anchor + 1, anchorLine.end), to);
  }
  setVim(view, { count: '', pending: '', ...change, cursor: to }, selection);
}

function handleVisual(
  editor: Editor,
  view: EditorView,
  vim: VimState,
  typed: string,
  done: (change?: Partial<VimState>) => Partial<VimState>,
): boolean {
  const state = view.state;
  const lines = linesOf(state.doc);
  const { from, to } = visualRange(state, vim, lines);
  switch (typed) {
    case 'd':
    case 'x':
    case 'y': {
      editor.storage.vim.register = state.doc.slice(from, to);
      copyText(state.doc.textBetween(from, to, '\n', '￼'));
      if (typed === 'y') {
        setVim(view, done({ mode: 'normal' }), TextSelection.create(state.doc, from));
        return true;
      }
      const tr = state.tr.delete(from, to);
      if (linesOf(tr.doc).length === 0) tr.insert(0, state.schema.nodes.paragraph.create());
      const now = linesOf(tr.doc);
      const at = now[clamp(lineIndexAt(now, from), 0, now.length - 1)];
      tr.setSelection(TextSelection.create(tr.doc, clamp(from, at.start, lastColumn(at))));
      view.dispatch(
        closeHistory(tr)
          .setMeta(vimKey, done({ mode: 'normal' }))
          .scrollIntoView(),
      );
      return true;
    }
    case '>':
    case '<': {
      // nest the selected list items under the one above, or take them out a level
      const item = ['taskItem', 'listItem'].find((name) => editor.isActive(name)) ?? 'listItem';
      if (typed === '>') editor.commands.sinkListItem(item);
      else editor.commands.liftListItem(item);
      const head = editor.state.selection.from;
      setVim(view, done({ mode: 'normal' }), TextSelection.create(editor.state.doc, head));
      return true;
    }
    case 'v':
    case 'V': {
      const mode = typed === 'v' ? 'visual' : 'visual-line';
      const cursor = visualHead(state, vim);
      if (mode === vim.mode) {
        setVim(view, done({ mode: 'normal' }), TextSelection.create(state.doc, cursor));
      } else {
        setVisual(view, { ...vim, mode }, cursor, { mode });
      }
      return true;
    }
  }
  setVim(view, done());
  return true;
}

// what a Visual `d` or `y` takes: the selection, or whole lines (their list items) in Visual line
function visualRange(
  state: EditorState,
  vim: VimState,
  lines: Line[],
): { from: number; to: number } {
  const { from, to } = state.selection;
  if (vim.mode !== 'visual-line') return { from, to };
  return {
    from: lineRange(state, lines[lineIndexAt(lines, from)]).from,
    to: lineRange(state, lines[lineIndexAt(lines, to)]).to,
  };
}

// `yy` and `y` also put the text on the system clipboard, where the platform allows it
function copyText(text: string): void {
  try {
    void globalThis.navigator?.clipboard?.writeText(text).catch(() => {});
  } catch {
    // no clipboard here: the register still has it
  }
}
