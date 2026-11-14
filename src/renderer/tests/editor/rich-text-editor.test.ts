// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { TaskStatus } from '@common/types';
import { RichTextEditor, type RichTextEditorProps } from '@renderer/editor/RichTextEditor';
import { setLinkEditing } from '@renderer/editor/extensions/editor-host';

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
      resolveEntity: (type, id) => ({
        type,
        id,
        title: 'Current title',
        status: TaskStatus.COMPLETED,
      }),
      onOpenEntity,
    });
    // React node views mount after the editor
    await act(async () => {});
    const pill = container.querySelector<HTMLElement>('[data-entity-type="task"]')!;
    expect(pill.textContent).toBe('Current title');
    // the design system's EntityPill is the button inside the node view
    act(() => pill.querySelector('button')!.click());
    expect(onOpenEntity).toHaveBeenCalledWith('task', 'tsk_1');
    // the stored label is untouched
    expect(editor.getMarkdown()).toBe('See [Old title](devbrain://task/tsk_1)');
  });

  // a real click on the element, as the browser sends it: the browser follows a link on `click`,
  // so the editor must cancel that event itself
  function clickLink(init: MouseEventInit = {}) {
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    act(() => {
      container.querySelector('a')!.dispatchEvent(click);
    });
    return click;
  }

  it('never lets a link navigate, and opens it through onOpenUrl on a click when read-only', () => {
    const onOpenUrl = vi.fn();
    render({ value: '[docs](https://example.com/docs)', editable: false, onOpenUrl });
    expect(clickLink().defaultPrevented).toBe(true);
    expect(onOpenUrl).toHaveBeenCalledWith('https://example.com/docs');
    expect(container.querySelector('a')!.getAttribute('target')).toBeNull();
  });

  it('opens a link on ⌘/Ctrl-click while editing; a plain click only places the caret', () => {
    const onOpenUrl = vi.fn();
    render({ value: '[docs](https://example.com/docs)', onOpenUrl });
    expect(clickLink().defaultPrevented).toBe(true);
    expect(onOpenUrl).not.toHaveBeenCalled();
    expect(clickLink({ ctrlKey: true }).defaultPrevented).toBe(true);
    expect(onOpenUrl).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('opens the design system\'s slash menu on "/", without Task, and runs the picked command', async () => {
    render({ value: '' });
    await act(async () => {
      editor.chain().focus().insertContent('/coll').run();
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    const menu = document.querySelector('[aria-label="Insert block"]')!;
    expect([...menu.querySelectorAll('[role="option"]')].map((item) => item.textContent)).toEqual([
      'Collapsible section',
    ]);
    await act(async () => {
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(editor.getMarkdown()).toBe('<details>\n<summary></summary>\n\n</details>');

    await act(async () => {
      editor.commands.setContent('', { emitUpdate: false });
      editor.chain().focus().insertContent('/').run();
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    const labels = [
      ...document.querySelectorAll('[aria-label="Insert block"] [role="option"]'),
    ].map((item) => item.textContent);
    expect(labels).toContain('Link to note');
    expect(labels).not.toContain('Task');
  });

  it('searches tasks, notes and events on "@" and inserts the pick as an entity link', async () => {
    const searchEntities = vi.fn(async () => [
      { type: 'task' as const, id: 'tsk_1', title: 'Fix login', status: TaskStatus.IN_PROGRESS },
      { type: 'note' as const, id: 'nte_1', title: 'Login notes' },
    ]);
    render({ value: '', searchEntities });
    await act(async () => {
      editor.chain().focus().insertContent('@login').run();
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(searchEntities).toHaveBeenLastCalledWith('login', ['task', 'note', 'event']);
    const menu = document.querySelector('[aria-label="Mention"]')!;
    expect(
      [...menu.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label')),
    ).toEqual(['Tasks', 'Notes']);
    await act(async () => {
      editor.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });
    await act(async () => {
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    // a space after the pill, to keep typing
    expect(editor.getMarkdown()).toBe('[Login notes](devbrain://note/nte_1) ');
  });

  it('keeps the last results in the "@" menu while the next search runs', async () => {
    const found = [{ type: 'task' as const, id: 'tsk_1', title: 'Fix login' }];
    let release: (value: typeof found) => void = () => {};
    const searchEntities = vi
      .fn()
      .mockResolvedValueOnce(found)
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    render({ value: '', searchEntities });
    const menuText = () => document.querySelector('[aria-label="Mention"]')?.textContent ?? '';
    await act(async () => {
      editor.chain().focus().insertContent('@log').run();
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(menuText()).toContain('Fix login');

    // the next search waits: the menu keeps what it showed, rather than "No results"
    await act(async () => {
      editor.commands.insertContent('in');
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(searchEntities).toHaveBeenLastCalledWith('login', ['task', 'note', 'event']);
    expect(menuText()).toContain('Fix login');
    expect(menuText()).not.toContain('No results');

    await act(async () => {
      release([]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(menuText()).toContain('No results');
  });

  it("inserts a Note callout from the slash menu, drawn by the design system's Callout", async () => {
    render({ value: '' });
    await act(async () => {
      editor.chain().focus().insertContent('/callout').run();
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    await act(async () => {
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    await act(async () => {
      editor.commands.insertContent('Run it off-hours.');
    });
    expect(editor.getMarkdown()).toBe('> [!NOTE]\n> Run it off-hours.');

    await act(async () => {
      editor.commands.setCalloutKind('warning');
    });
    expect(editor.getMarkdown()).toBe('> [!WARNING]\n> Run it off-hours.');
    const callout = container.querySelector('[data-callout="warning"]')!;
    expect(callout.textContent).toContain('Warning');
    expect(callout.textContent).toContain('Run it off-hours.');
  });

  it('names the open menu and its highlighted item on the editor, for a screen reader', async () => {
    render({ value: '' });
    const dom = editor.view.dom;
    await act(async () => {
      editor.chain().focus().insertContent('/head').run();
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    const list = document.querySelector('[aria-label="Insert block"]')!;
    const highlighted = () => list.querySelector('[data-highlighted]')!;
    expect(dom.getAttribute('aria-controls')).toBe(list.id);
    expect(dom.getAttribute('aria-autocomplete')).toBe('list');
    expect(dom.getAttribute('aria-activedescendant')).toBe(highlighted().id);
    expect(highlighted().textContent).toContain('Heading 1');

    await act(async () => {
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(highlighted().textContent).toContain('Heading 2');
    expect(dom.getAttribute('aria-activedescendant')).toBe(highlighted().id);

    await act(async () => {
      dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(dom.hasAttribute('aria-controls')).toBe(false);
    expect(dom.hasAttribute('aria-activedescendant')).toBe(false);
    // the editor's own attributes stay
    expect(dom.getAttribute('aria-label')).toBe('Note');
  });

  it('closes the link editor when focus goes back to the text, so the format toolbar returns', async () => {
    render({ value: 'Some text to link' });
    await act(async () => {
      editor.chain().focus().setTextSelection({ from: 6, to: 10 }).run();
      await new Promise((resolve) => setTimeout(resolve, 0));
      // ⌘K, or the toolbar's Link, with the text focused
      setLinkEditing(editor, true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const field = document.querySelector<HTMLInputElement>('[aria-label="Link address"]')!;
    expect(field).not.toBeNull();
    await act(async () => {
      field.focus();
      // a click back in the text
      editor.view.dom.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(editor.storage.editorHost.linkEditing).toBe(false);
    expect(document.querySelector('[aria-label="Link address"]')).toBeNull();
  });
});
