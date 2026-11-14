// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { looksLikeMarkdown, MarkdownClipboard } from '@renderer/editor/extensions/clipboard';
import { createDocumentExtensions } from '@renderer/editor/markdown';

let editor: Editor;

function load(markdown: string) {
  editor = new Editor({
    extensions: [...createDocumentExtensions(), MarkdownClipboard],
    content: markdown,
    contentType: 'markdown',
  });
}

afterEach(() => editor?.destroy());

// a paste as the browser sends one, with these clipboard entries, to the editor's element
function paste(entries: Record<string, string>) {
  const data = new DataTransfer();
  for (const [type, value] of Object.entries(entries)) data.setData(type, value);
  editor.view.dom.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  );
}

// what a copy of the whole note puts on the clipboard as plain text
function copyAll(): string {
  editor.commands.selectAll();
  return editor.view.serializeForClipboard(editor.state.selection.content()).text;
}

describe('pasting plain text', () => {
  it('reads markdown as markdown: headings, lists, tables, code, quotes', () => {
    load('');
    const markdown = [
      '## Plan',
      '',
      '- Move the queue',
      '- Backfill',
      '',
      '| Step | Owner |',
      '| ---- | ----- |',
      '| One  | Sam   |',
      '',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '> Keep it small.',
    ].join('\n');
    paste({ 'text/plain': markdown });
    expect(editor.getMarkdown()).toBe(markdown);
  });

  it('joins a pasted line into the paragraph it lands in', () => {
    load('Ask');
    editor.commands.focus('end');
    paste({ 'text/plain': ' **Sam** about `npm ci`' });
    expect(editor.getMarkdown()).toBe('Ask **Sam** about `npm ci`');
  });

  it('pastes text that does not look like markdown as it is', () => {
    load('');
    paste({ 'text/plain': 'Just a sentence with a # in it.\nAnd another line.' });
    expect(editor.state.doc.textContent).toContain('Just a sentence with a # in it.');
    expect(editor.getMarkdown()).not.toMatch(/^#/m);
  });

  it('pastes into a code block as raw text', () => {
    load('```\nx\n```');
    editor.commands.focus('end');
    paste({ 'text/plain': '## not a heading\n- not a list' });
    expect(editor.getMarkdown()).toBe('```\nx## not a heading\n- not a list\n```');
  });
});

describe('pasting from VS Code', () => {
  const vscode = (mode: string) =>
    JSON.stringify({ version: 1, isFromEmptySelection: false, mode });

  it('reads a markdown file as markdown', () => {
    load('');
    paste({
      'text/plain': '# Title\n\nSome *text*.',
      'text/html': '<div><span>whatever VS Code sends</span></div>',
      'vscode-editor-data': vscode('markdown'),
    });
    expect(editor.getMarkdown()).toBe('# Title\n\nSome *text*.');
  });

  it('pastes code from another file as a code block in its language', () => {
    load('');
    paste({
      'text/plain': 'const a = 1;\nconst b = 2;\n',
      'text/html': '<div><span>const</span> a</div>',
      'vscode-editor-data': vscode('typescript'),
    });
    expect(editor.getMarkdown()).toBe('```typescript\nconst a = 1;\nconst b = 2;\n```');
  });

  it('leaves a few words of code in the line', () => {
    load('Run');
    editor.commands.focus('end');
    paste({ 'text/plain': ' npm ci', 'vscode-editor-data': vscode('shellscript') });
    expect(editor.getMarkdown()).toBe('Run npm ci');
  });
});

describe('copying', () => {
  it('puts the markdown on the clipboard as plain text', () => {
    const markdown = '## Plan\n\n- One\n- **Two**\n\n> [!NOTE]\n> A callout';
    load(markdown);
    expect(copyAll()).toBe(markdown);
  });

  it('copies code in a code block as it is', () => {
    load('```ts\nconst a = 1;\n```');
    // the code starts inside the block, at position 1
    editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(editor.view.serializeForClipboard(editor.state.selection.content()).text).toBe('const');
  });
});

describe('looksLikeMarkdown', () => {
  it('knows markdown from prose', () => {
    for (const text of [
      '# Title',
      '- item',
      '1. item',
      '```',
      '> quote',
      '[a](https://x.y)',
      '**bold**',
      'run `x`',
    ]) {
      expect(looksLikeMarkdown(text)).toBe(true);
    }
    for (const text of ['Plain words.', 'A # mid-line', '2024-01-02 notes', 'a - b']) {
      expect(looksLikeMarkdown(text)).toBe(false);
    }
  });
});
