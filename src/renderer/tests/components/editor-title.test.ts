// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorTitle } from '@renderer/components/editor/EditorContent';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// An editable EditorTitle is plaintext-only, and an edit that leaves it more than one line is set
// back to one. It reads the lines with innerText, which happy-dom gets wrong for a "\n" or a <br>
// (it drops them; Chromium reads both as line breaks), so these edits use a block, which it reads
// as Chromium does.

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function draw(props: Parameters<typeof EditorTitle>[0]) {
  act(() =>
    root.render(
      createElement(EditorTitle, { suppressContentEditableWarning: true, ...props }, 'Draft'),
    ),
  );
  return container.querySelector('h1')!;
}

/** What an edit (a paste, a drop) left in the title, then the input event the browser sends. */
function edit(title: HTMLElement, html: string) {
  title.innerHTML = html;
  act(() => {
    title.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('EditorTitle', () => {
  it('is plaintext-only while editable', () => {
    expect(draw({ contentEditable: true }).getAttribute('contenteditable')).toBe('plaintext-only');
    expect(draw({ contentEditable: false }).getAttribute('contenteditable')).toBe('false');
    expect(draw({}).hasAttribute('contenteditable')).toBe(false);
  });

  it('turns the line breaks an edit leaves into spaces, the caret at the end', () => {
    const title = draw({ contentEditable: true });
    title.focus();
    edit(title, 'Draft a<div>b</div>');
    expect(title.innerHTML).toBe('Draft a b');
    const caret = window.getSelection()!;
    expect(caret.isCollapsed).toBe(true);
    // after the title's text
    expect([caret.focusNode, caret.focusOffset]).toEqual([title, title.childNodes.length]);
  });

  it('empties a title cleared to the <br> the browser leaves, so its placeholder shows', () => {
    const title = draw({ contentEditable: true });
    edit(title, '<br>');
    expect(title.matches(':empty')).toBe(true);
  });

  it('leaves one line of text alone, and a title that is not editable', () => {
    const title = draw({ contentEditable: true });
    edit(title, 'Draft  two');
    expect(title.innerHTML).toBe('Draft  two');
    const shown = draw({});
    edit(shown, 'a<div>b</div>');
    expect(shown.innerHTML).toBe('a<div>b</div>');
  });
});
