// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { createDocumentExtensions } from '../../editor/markdown';
import {
  editorVimMode,
  setVimEnabled,
  VimInsertEscape,
  VimMode,
} from '../../editor/extensions/vim';
import { MODE_ATTRIBUTE, MODE_CHANGE_EVENT } from '../../keyboard/keymap';

// Vim keys in the rich text editor: its modes, motions with counts, operators, Visual and Visual
// line, and what it reports to the app's dispatcher.

let editor: Editor;

function load(markdown: string, { vim = true } = {}) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  editor = new Editor({
    element,
    extensions: [...createDocumentExtensions(), VimMode, VimInsertEscape],
    content: markdown,
    contentType: 'markdown',
  });
  setVimEnabled(editor, vim);
  editor.commands.focus('start');
}

afterEach(() => {
  editor?.destroy();
  document.body.innerHTML = '';
});

function key(name: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  editor.view.dom.dispatchEvent(event);
  return event;
}

function keys(sequence: string) {
  for (const k of sequence) key(k);
}

const head = () => editor.state.selection.head;
// the cursor as line and column, counting the document's textblocks
function at(): [line: number, column: number] {
  let line = -1;
  let found: [number, number] = [0, 0];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    line += 1;
    if (head() >= pos + 1 && head() <= pos + 1 + node.content.size)
      found = [line, head() - pos - 1];
    return false;
  });
  return found;
}
const markdown = () => editor.getMarkdown().trim();

describe('modes', () => {
  it('starts in Normal, which types nothing', () => {
    load('Hello world');
    expect(editorVimMode(editor)).toBe('normal');
    expect(editor.view.dom.getAttribute(MODE_ATTRIBUTE)).toBe('normal');
    const event = key('q');
    expect(event.defaultPrevented).toBe(true);
    expect(markdown()).toBe('Hello world');
  });

  it('goes into Insert with i, a, I and A, and back with Esc, one to the left', () => {
    load('Hello world');
    keys('ll');
    key('i');
    expect(editorVimMode(editor)).toBe('insert');
    expect(editor.view.dom.getAttribute(MODE_ATTRIBUTE)).toBe('insert');
    // Insert leaves keys to TipTap
    expect(key('q').defaultPrevented).toBe(false);
    key('Escape');
    expect(editorVimMode(editor)).toBe('normal');
    expect(at()).toEqual([0, 1]);
    key('A');
    expect(at()).toEqual([0, 11]);
    key('Escape');
    key('I');
    expect(at()).toEqual([0, 0]);
    key('Escape');
    key('a');
    expect(at()).toEqual([0, 1]);
  });

  it('tells the app of each change, from the editor’s element', () => {
    load('Hello');
    const modes: unknown[] = [];
    editor.view.dom.addEventListener(MODE_CHANGE_EVENT, (event) =>
      modes.push((event as CustomEvent).detail),
    );
    key('i');
    key('Escape');
    key('V');
    expect(modes).toEqual(['insert', 'normal', 'visual-line']);
  });

  it('leaves the editor with Esc in Normal', () => {
    load('Hello');
    const blur = vi.spyOn(editor.view.dom, 'blur');
    key('Escape');
    expect(blur).toHaveBeenCalled();
  });

  it('does nothing while Vim keys are off', () => {
    load('Hello', { vim: false });
    expect(editorVimMode(editor)).toBeNull();
    expect(editor.view.dom.hasAttribute(MODE_ATTRIBUTE)).toBe(false);
    expect(key('j').defaultPrevented).toBe(false);
  });
});

describe('motions', () => {
  const doc = ['First line here', '', 'Second one', '', '- Item one', '- Item two'].join('\n');

  it('moves by characters, lines and counts, keeping the column', () => {
    load(doc);
    keys('3l');
    expect(at()).toEqual([0, 3]);
    key('j');
    expect(at()).toEqual([1, 3]);
    keys('2j');
    expect(at()).toEqual([3, 3]);
    key('k');
    key('h');
    expect(at()).toEqual([2, 2]);
    key('$');
    expect(at()).toEqual([2, 7]);
    key('0');
    expect(at()).toEqual([2, 0]);
    key('G');
    expect(at()).toEqual([3, 0]);
    keys('gg');
    expect(at()).toEqual([0, 0]);
    keys('3G');
    expect(at()).toEqual([2, 0]);
  });

  it('moves by words, across lines', () => {
    load(doc);
    key('w');
    expect(at()).toEqual([0, 6]);
    keys('2w');
    expect(at()).toEqual([1, 0]);
    key('b');
    expect(at()).toEqual([0, 11]);
    key('e');
    expect(at()).toEqual([0, 14]);
  });

  it('stops at a line’s last character', () => {
    load('abc');
    keys('9l');
    expect(at()).toEqual([0, 2]);
  });
});

describe('operators', () => {
  it('x deletes the character under the cursor', () => {
    load('Hello');
    keys('lx');
    expect(markdown()).toBe('Hllo');
    keys('2x');
    expect(markdown()).toBe('Ho');
  });

  it('dd deletes the line, 2dd two, and u undoes', () => {
    load(['One', '', 'Two', '', 'Three', '', 'Four'].join('\n'));
    keys('dd');
    expect(markdown()).toBe(['Two', '', 'Three', '', 'Four'].join('\n'));
    keys('2dd');
    expect(markdown()).toBe('Four');
    key('u');
    expect(markdown()).toBe(['Two', '', 'Three', '', 'Four'].join('\n'));
  });

  it('dd on a list item deletes the item, and the last line leaves an empty paragraph', () => {
    load(['- One', '- Two'].join('\n'));
    keys('dd');
    expect(markdown()).toBe('- Two');
    keys('dd');
    expect(markdown()).toBe('');
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph');
  });

  it('yy and p copy a line below, P above', () => {
    load(['One', '', 'Two'].join('\n'));
    keys('yyp');
    expect(markdown()).toBe(['One', '', 'One', '', 'Two'].join('\n'));
    keys('G');
    key('P');
    expect(markdown()).toBe(['One', '', 'One', '', 'One', '', 'Two'].join('\n'));
  });

  it('o opens a line below in Insert, O above', () => {
    load(['One', '', 'Two'].join('\n'));
    key('o');
    expect(editorVimMode(editor)).toBe('insert');
    expect(at()).toEqual([1, 0]);
    expect(editor.state.doc.childCount).toBe(3);
    key('Escape');
    keys('G');
    key('O');
    expect(at()).toEqual([2, 0]);
    expect(editor.state.doc.childCount).toBe(4);
  });
});

describe('Visual and Visual line', () => {
  it('v selects to the cursor, inclusive, and d deletes it', () => {
    load('Hello world');
    keys('vll');
    expect(editorVimMode(editor)).toBe('visual');
    expect(
      editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to),
    ).toBe('Hel');
    key('d');
    expect(markdown()).toBe('lo world');
    expect(editorVimMode(editor)).toBe('normal');
  });

  it('V selects whole lines, j grows it, d deletes them', () => {
    load(['One', '', 'Two', '', 'Three'].join('\n'));
    keys('Vj');
    expect(editorVimMode(editor)).toBe('visual-line');
    key('d');
    expect(markdown()).toBe('Three');
  });

  it('y copies the lines for p, and Esc ends it', () => {
    load(['One', '', 'Two'].join('\n'));
    keys('Vy');
    expect(editorVimMode(editor)).toBe('normal');
    keys('jp');
    expect(markdown()).toBe(['One', '', 'Two', '', 'One'].join('\n'));
    keys('v');
    key('Escape');
    expect(editorVimMode(editor)).toBe('normal');
  });

  it('> nests list items under the one above, < takes them out', () => {
    load(['- One', '- Two', '- Three'].join('\n'));
    keys('jVj>');
    expect(markdown()).toBe(['- One', '  - Two', '  - Three'].join('\n'));
    keys('V<');
    expect(markdown()).toContain('- Two');
  });
});

describe('the clipboard', () => {
  it('puts what yy took on the system clipboard too', () => {
    const writeText = vi.fn(() => Promise.resolve());
    const before = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    load('Copy me');
    keys('yy');
    expect(writeText).toHaveBeenCalledWith('Copy me');
    if (before) Object.defineProperty(navigator, 'clipboard', before);
    else delete (navigator as { clipboard?: unknown }).clipboard;
  });
});
