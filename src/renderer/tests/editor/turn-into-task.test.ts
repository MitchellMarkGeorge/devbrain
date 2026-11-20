import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { EditorHostExtension, setEditorHost } from '@renderer/editor/extensions/editor-host';
import { createDocumentExtensions } from '@renderer/editor/markdown';
import {
  blockTaskTitle,
  openNewTaskFromLine,
  selectionTaskTitle,
  turnSelectionIntoTask,
} from '@renderer/editor/turn-into-task';
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

  it('still links the task when only the caret moved while it was made', async () => {
    load('Ship it');
    const host = taskHost();
    host.hold();
    select('Ship it');
    const done = turnSelectionIntoTask(editor);
    editor.commands.setTextSelection(1);
    host.release();
    expect(await done).toBe(true);
    expect(editor.getMarkdown()).toBe('[Ship it](devbrain://task/tsk_new)');
  });

  it('makes the task but leaves the text when the note changed while it was made', async () => {
    load('Ship it');
    const host = taskHost();
    host.hold();
    select('Ship it');
    const done = turnSelectionIntoTask(editor);
    editor.commands.insertContentAt(1, 'Todo: ');
    host.release();
    expect(await done).toBe(false);
    expect(host.titles).toEqual(['Ship it']);
    expect(editor.getMarkdown()).toBe('Todo: Ship it');
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

describe('New task from the slash menu', () => {
  // the "/task" typed at the end of the first block
  const slash = () => {
    const to = editor.state.doc.firstChild!.nodeSize - 1;
    editor.commands.setTextSelection(to);
    return { from: to - '/task'.length, to };
  };

  it('titles it with the rest of the line, and has no title for a line of only "/task"', () => {
    load('Call  Ana /task');
    expect(blockTaskTitle(editor, slash())).toBe('Call Ana');
    load('/task');
    expect(blockTaskTitle(editor, slash())).toBeNull();
  });

  it('opens New task with the line as its title, and leaves the text but for the "/task"', () => {
    load('Call Ana /task\n\nNext');
    const openNewTask = vi.fn();
    setEditorHost(editor, { openNewTask });
    expect(openNewTaskFromLine(editor, slash())).toBe(true);
    expect(openNewTask).toHaveBeenCalledWith('Call Ana');
    expect(editor.getMarkdown()).toBe('Call Ana\n\nNext');

    load('/task');
    setEditorHost(editor, { openNewTask });
    expect(openNewTaskFromLine(editor, slash())).toBe(true);
    expect(openNewTask).toHaveBeenLastCalledWith(undefined);
    expect(editor.getMarkdown()).toBe('');
  });

  it('does nothing without a host that opens the dialog', () => {
    load('Call Ana /task');
    expect(openNewTaskFromLine(editor, slash())).toBe(false);
    expect(editor.getMarkdown()).toBe('Call Ana /task');
  });
});
