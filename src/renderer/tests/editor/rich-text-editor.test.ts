// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { RichTextEditor, type RichTextEditorProps } from '../../editor/RichTextEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// written the way the user wrote it, not the editor's spelling (`*` bullets, `__bold__`)
const STORED = '* one\n* two\n\n__bold__ & <b>raw</b>';

let container: HTMLDivElement;
let root: Root;
let editor: Editor;

function render(props: Partial<RichTextEditorProps>) {
  act(() => {
    root.render(
      createElement(RichTextEditor, {
        value: STORED,
        label: 'Note',
        onReady: (instance: Editor) => (editor = instance),
        ...props,
      }),
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('RichTextEditor', () => {
  it('does not report a change when a note is only opened', () => {
    const onChange = vi.fn();
    render({ onChange });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector('[role="textbox"]')?.getAttribute('aria-label')).toBe('Note');
  });

  it('reports the markdown after an edit, and the stored text again once undone', () => {
    const onChange = vi.fn();
    render({ onChange });

    act(() => {
      editor.chain().focus('end').insertContent('!').run();
    });
    expect(onChange).toHaveBeenLastCalledWith('- one\n- two\n\n**bold** & <b>raw</b>!');

    act(() => {
      editor.commands.undo();
    });
    expect(onChange).toHaveBeenLastCalledWith(STORED);
  });

  it('loads a new value from outside without reporting it as an edit', () => {
    const onChange = vi.fn();
    render({ onChange });
    render({ onChange, value: '# Changed on disk' });
    expect(container.querySelector('h1')?.textContent).toBe('Changed on disk');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not reload the markdown it just sent', () => {
    let latest = STORED;
    const onChange = vi.fn((markdown: string) => (latest = markdown));
    render({ onChange });
    act(() => {
      editor.chain().focus('end').insertContent('!').run();
    });
    const selection = editor.state.selection.from;
    render({ onChange, value: latest });
    // a reload would have moved the caret to the start
    expect(editor.state.selection.from).toBe(selection);
  });

  it('shows an entity link with its current title, and opens it on click', async () => {
    const onOpenEntity = vi.fn();
    render({
      value: 'See [Old title](devbrain://task/tsk_1)',
      resolveEntity: (type, id) => ({ type, id, title: 'Current title', status: 'completed' }),
      onOpenEntity,
    });
    // React node views mount after the editor
    await act(async () => {});
    const pill = container.querySelector<HTMLElement>('[data-entity-type="task"]')!;
    expect(pill.textContent).toBe('Current title');
    act(() => pill.click());
    expect(onOpenEntity).toHaveBeenCalledWith('task', 'tsk_1');
    // the stored label is untouched
    expect(editor.getMarkdown()).toBe('See [Old title](devbrain://task/tsk_1)');
  });

  it('opens a safe link only through onOpenUrl', () => {
    const onOpenUrl = vi.fn();
    render({ value: '[docs](https://example.com/docs)', editable: false, onOpenUrl });
    const link = container.querySelector('a')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    Object.defineProperty(click, 'target', { value: link });
    act(() => {
      editor.view.someProp('handleClick', (handle) => handle(editor.view, 1, click));
    });
    expect(click.defaultPrevented).toBe(true);
    expect(onOpenUrl).toHaveBeenCalledWith('https://example.com/docs');
    expect(link.getAttribute('target')).toBeNull();
  });
});
