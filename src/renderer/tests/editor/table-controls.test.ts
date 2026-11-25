import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RichTextEditor } from '@renderer/editor/RichTextEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The table's controls follow the pointer by its position. The DOM here lays nothing out, so every
// box is at 0,0 and a pointer there is over the table, wherever the element under it is.

const TABLE = '| Name | Value |\n| --- | --- |\n| a | 1 |\n';

let page: HTMLDivElement;
let root: Root;

beforeEach(() => {
  page = document.createElement('div');
  document.body.append(page);
  root = createRoot(page);
  act(() => root.render(createElement(RichTextEditor, { initialValue: TABLE, label: 'Note' })));
});

afterEach(() => {
  act(() => root.unmount());
  page.remove();
  document.body.replaceChildren();
});

// a pointer move over `target`, then the frame the controls update in
async function moveOver(target: Element) {
  await act(async () => {
    target.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

const handles = () => page.querySelectorAll('button[aria-label$=" options"]');

describe('TableControls', () => {
  it('shows the handles for the pointer over a cell, or the page around the table', async () => {
    await moveOver(page.querySelector('td')!);
    expect(handles()).toHaveLength(2);

    await moveOver(document.body);
    await moveOver(page);
    expect(handles()).toHaveLength(2);
  });

  it('hides them for the pointer over something drawn above the table, such as a dialog', async () => {
    await moveOver(page.querySelector('td')!);
    expect(handles()).toHaveLength(2);

    // a dialog is portalled into <body>, beside the page, at the same place on screen
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.append(document.createElement('button'));
    document.body.append(dialog);
    await moveOver(dialog.querySelector('button')!);
    expect(handles()).toHaveLength(0);
  });
});
