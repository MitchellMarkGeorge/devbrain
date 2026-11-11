// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { applyBlockType, currentBlockType } from '../../editor/block-types';
import { EditorHostExtension, setLinkEditing } from '../../editor/extensions/editor-host';
import { linkHref } from '../../editor/FormatBubble';
import { createDocumentExtensions } from '../../editor/markdown';

let editor: Editor;

function load(markdown: string) {
  editor = new Editor({
    extensions: [...createDocumentExtensions(), EditorHostExtension],
    content: markdown,
    contentType: 'markdown',
  });
}

afterEach(() => editor?.destroy());

// the position just inside the first text that matches
function caretAt(text: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(text)) {
      found = pos + node.text.indexOf(text) + 1;
    }
  });
  return found;
}

describe('the block type the caret is in', () => {
  it('names the list or quote first, then the block', () => {
    load(
      [
        '# Title',
        '',
        'Text',
        '',
        '- Bullet',
        '',
        '1. Number',
        '',
        '- [ ] Todo',
        '',
        '> Quote',
        '',
        '```',
        'code',
        '```',
      ].join('\n'),
    );
    const at = (text: string) => {
      editor.commands.setTextSelection(caretAt(text));
      return currentBlockType(editor);
    };
    expect(['Title', 'Text', 'Bullet', 'Number', 'Todo', 'Quote', 'code'].map(at)).toEqual([
      'heading-1',
      'text',
      'bulleted-list',
      'numbered-list',
      'todo-list',
      'quote',
      'code',
    ]);
  });

  it('turns a block into another, out of its list first', () => {
    load('- One\n- Two');
    editor.commands.setTextSelection(caretAt('Two'));
    applyBlockType(editor.chain(), 'heading-2');
    expect(editor.getMarkdown()).toBe('- One\n\n## Two');
    applyBlockType(editor.chain(), 'quote');
    expect(editor.getMarkdown()).toBe('- One\n\n> Two');
  });
});

describe('links from the link toolbar', () => {
  it('takes a bare address as https, and refuses what cannot be opened', () => {
    expect(linkHref('example.com/q')).toBe('https://example.com/q');
    expect(linkHref(' https://example.com ')).toBe('https://example.com/');
    expect(linkHref('javascript:alert(1)')).toBeNull();
    expect(linkHref('')).toBeNull();
  });

  it('opens on ⌘K for a selection or a link, and leaves ⌘K to the app otherwise', () => {
    load('Plain text and [a link](https://example.com).');
    // ⌘K on macOS, Ctrl+K elsewhere: whichever this platform's "Mod" is
    const press = (init: KeyboardEventInit) =>
      editor.view.someProp('handleKeyDown', (handle) =>
        handle(editor.view, new KeyboardEvent('keydown', { key: 'k', ...init })),
      );
    const pressModK = () => press({ ctrlKey: true }) || press({ metaKey: true });

    editor.commands.setTextSelection(caretAt('Plain'));
    expect(pressModK()).toBeFalsy();
    expect(editor.storage.editorHost.linkEditing).toBe(false);

    editor.commands.setTextSelection(caretAt('link'));
    expect(pressModK()).toBe(true);
    expect(editor.storage.editorHost.linkEditing).toBe(true);
  });

  it('closes on Escape in the text, and leaves Escape to the app otherwise', () => {
    load('Plain text and [a link](https://example.com).');
    const escape = () =>
      editor.view.someProp('handleKeyDown', (handle) =>
        handle(editor.view, new KeyboardEvent('keydown', { key: 'Escape' })),
      );
    expect(escape()).toBeFalsy();
    setLinkEditing(editor, true);
    expect(escape()).toBe(true);
    expect(editor.storage.editorHost.linkEditing).toBe(false);
  });
});
