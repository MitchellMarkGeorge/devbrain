// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { EditorHostExtension, setEditorHost } from '@renderer/editor/extensions/editor-host';
import { createDocumentExtensions } from '@renderer/editor/markdown';
import { selectionTaskTitle, turnSelectionIntoTask } from '@renderer/editor/turn-into-task';
import type { EditorEntity } from '@renderer/editor/types';

let editor: Editor;

function load(markdown: string) {
  editor = new Editor({
    extensions: [...createDocumentExtensions(), EditorHostExtension],
    content: markdown,
    contentType: 'markdown',
  });
}

afterEach(() => editor?.destroy());

// selects the first text that matches
function select(text: string) {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text?.includes(text)) {
      from = pos + node.text.indexOf(text);
    }
  });
  editor.commands.setTextSelection({ from, to: from + text.length });
}

// a host that makes tasks, and the titles it was asked for; `wait` holds each until released
function taskHost({ fail = false } = {}) {
  const titles: string[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let hold = false;
  setEditorHost(editor, {
    async createTask(title): Promise<EditorEntity | null> {
      titles.push(title);
      if (hold) await held;
      return fail ? null : { type: 'task', id: 'tsk_new', title };
    },
  });
  return {
    titles,
    hold() {
      hold = true;
    },
    release,
  };
}

describe('the title a selection would give a task', () => {
  it('is the selected text, its spaces collapsed and pills read as their labels', () => {
    load('Call  [Ana](devbrain://task/tsk_1) about the launch.');
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });
    expect(selectionTaskTitle(editor)).toBe('Call Ana about the launch.');
  });

  it('is none for a caret, a selection across blocks, code or blanks', () => {
    load('One\n\nTwo\n\n```\ncode\n```');
    editor.commands.setTextSelection(2);
    expect(selectionTaskTitle(editor)).toBeNull();
    editor.commands.setTextSelection({ from: 2, to: 8 });
    expect(selectionTaskTitle(editor)).toBeNull();
    select('code');
    expect(selectionTaskTitle(editor)).toBeNull();
  });
});

describe('turning a selection into a task', () => {
  it('makes a task from the text and links it in its place', async () => {
    load('Remember to ship the release notes today.');
    const host = taskHost();
    select('ship the release notes');
    expect(await turnSelectionIntoTask(editor)).toBe(true);
    expect(host.titles).toEqual(['ship the release notes']);
    expect(editor.getMarkdown()).toBe(
      'Remember to [ship the release notes](devbrain://task/tsk_new) today.',
    );
  });

  it('replaces the text where it is once the task is made, after typing before it', async () => {
    load('Ship it');
    const host = taskHost();
    host.hold();
    select('Ship it');
    const done = turnSelectionIntoTask(editor);
    editor.commands.insertContentAt(1, 'Todo: ');
    host.release();
    expect(await done).toBe(true);
    expect(editor.getMarkdown()).toBe('Todo: [Ship it](devbrain://task/tsk_new)');
  });

  it('leaves the text when the host could not make the task, or the text went meanwhile', async () => {
    load('Ship it');
    taskHost({ fail: true });
    select('Ship it');
    expect(await turnSelectionIntoTask(editor)).toBe(false);
    expect(editor.getMarkdown()).toBe('Ship it');

    const host = taskHost();
    host.hold();
    select('Ship it');
    const done = turnSelectionIntoTask(editor);
    editor.commands.clearContent();
    host.release();
    expect(await done).toBe(false);
    expect(editor.getMarkdown()).toBe('');
  });

  it('does nothing without a host that makes tasks', async () => {
    load('Ship it');
    select('Ship it');
    expect(await turnSelectionIntoTask(editor)).toBe(false);
    expect(editor.getMarkdown()).toBe('Ship it');
  });
});
