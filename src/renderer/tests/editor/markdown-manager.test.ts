import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import type { MarkdownManager } from '@tiptap/markdown';
import { marked } from 'marked';
import { createDocumentExtensions, parseMarkdown } from '@renderer/editor/markdown';

function tokenizerCount(manager: MarkdownManager): number {
  const extensions = manager.instance.defaults.extensions;
  return (extensions?.block?.length ?? 0) + (extensions?.inline?.length ?? 0);
}

function makeEditor(extensions = createDocumentExtensions()): Editor {
  return new Editor({
    extensions,
    content:
      '# Title\n\n> [!NOTE]\n> A callout\n\n<details>\n<summary>More</summary>\n\nBody\n\n</details>',
    contentType: 'markdown',
  });
}

// A MarkdownManager registers every extension's tokenizer on its marked instance and never removes
// them. On marked's global instance they would pile up with every editor made and slow every
// later parse.
describe("the editor's marked instance", () => {
  it("leaves marked's global instance untouched", () => {
    const defaults = marked.defaults;
    for (let i = 0; i < 5; i++) makeEditor().destroy();
    parseMarkdown('Some *text* with <kbd>K</kbd>');
    // no tokenizers registered on it, and no options set (which replaces its defaults)
    expect(marked.defaults.extensions).toBeFalsy();
    expect(marked.defaults).toBe(defaults);
  });

  it('registers each tokenizer once per editor, however many editors came before', () => {
    const first = makeEditor();
    const count = tokenizerCount(first.markdown!);
    const tokenizers = first.extensionManager.extensions.filter(
      (extension) => extension.config.markdownTokenizer,
    );
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(tokenizers.length);
    first.destroy();

    for (let i = 0; i < 20; i++) makeEditor().destroy();

    const later = makeEditor();
    expect(later.markdown!.instance).not.toBe(marked);
    expect(later.markdown!.instance).not.toBe(first.markdown!.instance);
    expect(tokenizerCount(later.markdown!)).toBe(count);
    later.destroy();
  });

  it('parses the initial markdown content into the document', () => {
    const editor = makeEditor();
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual([
      'heading',
      'callout',
      'details',
    ]);
    expect(editor.getMarkdown()).toContain('> [!NOTE]\n> A callout');
    editor.destroy();
  });
});
