// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { CODE_LANGUAGES, languageLabel, languageValue } from '@renderer/editor/code-languages';
import { createDocumentExtensions, normalizeMarkdown } from '@renderer/editor/markdown';

let editor: Editor;

function load(markdown: string) {
  editor = new Editor({
    extensions: createDocumentExtensions(),
    content: markdown,
    contentType: 'markdown',
  });
}

afterEach(() => editor?.destroy());

// the classes highlighting put on the code, in order
function highlightClasses(): string[] {
  return [...editor.view.dom.querySelectorAll('pre code span[class]')].map(
    (span) => span.className,
  );
}

describe('highlighting', () => {
  it('colours code in its language, without changing the markdown', () => {
    const markdown = "```ts\nconst answer: number = 42; // the answer\nreturn 'yes';\n```";
    load(markdown);
    expect(highlightClasses()).toEqual(
      expect.arrayContaining(['hljs-keyword', 'hljs-number', 'hljs-comment', 'hljs-string']),
    );
    expect(editor.getMarkdown()).toBe(markdown);
    expect(normalizeMarkdown(markdown)).toBe(markdown);
  });

  it('never guesses: no language, or one it does not know, stays plain', () => {
    load('```\nconst a = 1;\n```\n\n```mermaid\ngraph TD; A-->B\n```');
    expect(highlightClasses()).toEqual([]);
  });

  it('follows a change of language', () => {
    load('```\nSELECT 1;\n```');
    expect(highlightClasses()).toEqual([]);
    editor.commands.setTextSelection(2);
    editor.commands.updateAttributes('codeBlock', { language: 'sql' });
    expect(highlightClasses()).toContain('hljs-keyword');
    expect(editor.getMarkdown()).toBe('```sql\nSELECT 1;\n```');
  });
});

describe('languages', () => {
  it('names a fence by its language, aliases included', () => {
    expect(
      ['ts', 'tsx', 'typescript', 'sh', 'yml', 'py', '', 'mermaid'].map(languageLabel),
    ).toEqual([
      'TypeScript',
      'TypeScript',
      'TypeScript',
      'Bash',
      'YAML',
      'Python',
      'Plain text',
      'mermaid',
    ]);
  });

  it('ticks the same menu item for a language and its aliases', () => {
    expect(languageValue('ts')).toBe('typescript');
    expect(languageValue('typescript')).toBe('typescript');
    expect(languageValue(null)).toBe('');
    expect(languageValue('mermaid')).toBe('mermaid');
  });

  it('offers Plain text first, then the languages by name', () => {
    expect(CODE_LANGUAGES[0]).toEqual({ value: '', label: 'Plain text' });
    const labels = CODE_LANGUAGES.slice(1).map((item) => item.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(labels).toEqual(expect.arrayContaining(['TypeScript', 'Rust', 'Go', 'SQL', 'PHP']));
    // grammars others embed are highlighted, but not offered
    expect(labels).not.toContain('python-repl');
    expect(languageLabel('python-repl')).toBe('python-repl');
  });
});
