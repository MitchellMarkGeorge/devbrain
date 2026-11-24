import { describe, expect, it } from 'vitest';
import { Editor, Node, getSchema } from '@tiptap/core';
import { TaskList } from '@tiptap/extension-list';
import { MarkdownManager } from '@tiptap/markdown';
import { marked } from 'marked';
import { createDocumentExtensions, ownMarked, parseMarkdown } from '@renderer/editor/markdown';

// How the editor's markdown is lexed, which decides how long a note takes to load: each editor
// keeps its tokenizers on a marked instance of its own, and no tokenizer reads the rest of the
// note at every block.

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
    for (let i = 0; i < 5; i++) makeEditor().destroy();
    parseMarkdown('Some *text* with <kbd>K</kbd>');
    expect(marked.defaults.extensions).toBeFalsy();
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

describe('lexing a long note', () => {
  it("hands a block's start search no more than the paragraph it could cut", () => {
    // a block tokenizer that never matches, recording how much source each search is given
    const searched: number[] = [];
    const Probe = Node.create({
      name: 'probe',
      group: 'block',
      markdownTokenizer: {
        name: 'probe',
        level: 'block',
        start: (src) => {
          searched.push(src.length);
          return -1;
        },
        tokenize: () => undefined,
      },
    });
    const editor = new Editor({ extensions: [...createDocumentExtensions(), Probe] });
    const paragraph = 'A paragraph of the note,\nwritten on two lines.\n\n';
    editor.markdown!.parse(paragraph.repeat(200));

    expect(searched.length).toBeGreaterThan(100);
    expect(Math.max(...searched)).toBeLessThanOrEqual(paragraph.length);
    editor.destroy();
  });

  // the same tokens as TipTap's own manager, with its task list, over a marked instance of its own
  it('reads markdown as TipTap does', () => {
    const editor = new Editor({ extensions: createDocumentExtensions() });
    const extensions = createDocumentExtensions().map((extension) =>
      extension.name === 'taskList' ? TaskList : extension,
    );
    getSchema(extensions);
    const stock = new MarkdownManager({
      extensions,
      marked: ownMarked(),
      markedOptions: { gfm: true },
    });
    const lex = (manager: MarkdownManager, markdown: string) =>
      new manager.instance.Lexer(manager.instance.defaults).lex(markdown);

    const notes = [
      'A line\n> [!NOTE]\n> straight after it\n\nAfter',
      'A line\n<details>\n<summary>Setup</summary>\n\nBody\n\n</details>\n\nAfter',
      'A line\n| a | b |\n| - | - |\n| 1 | 2 |\n',
      'A line\n   \n> [!TIP]\n> after a line of spaces',
      'A line\n\t\n> [!TIP]\n> after a line holding a tab',
      'A line\n- [ ] a task\n- [x] done\n\n1. one\n2. two',
      '\n\n- [ ] after blank lines\n  - [ ] nested\n    more of it\n- [x] last\nText after',
      '-  [ ]  spaced\n* [X] star\n+ [ ]\n- [ ]no space',
    ];
    for (const note of notes) {
      expect(lex(editor.markdown!, note)).toEqual(lex(stock, note));
      expect(editor.markdown!.parse(note)).toEqual(stock.parse(note));
    }
    editor.destroy();
  });
});
