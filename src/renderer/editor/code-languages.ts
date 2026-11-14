import hljs from 'highlight.js/lib/core';
import { common, createLowlight } from 'lowlight';
import type { CodeLanguage } from '@renderer/components';

/**
 * The languages a code block is highlighted in: highlight.js's common set (TypeScript,
 * JavaScript, Python, Go, Rust, Bash, SQL, YAML, JSON and some thirty more), through lowlight,
 * which TipTap's CodeBlockLowlight reads. A fence's language can be any of their names or aliases
 * (` ```ts `, ` ```sh `, ` ```yml `).
 *
 * A block with no language, or one these don't know (` ```mermaid `), stays plain text: the
 * highlighter never guesses, since a wrong guess colours code misleadingly.
 */

const lowlight = createLowlight(common);

export const highlighter = {
  ...lowlight,
  highlightAuto: (code: string) => lowlight.highlight('plaintext', code),
};

// a registry of the same grammars for their names and aliases ("ts" is TypeScript)
for (const [name, grammar] of Object.entries(common)) hljs.registerLanguage(name, grammar);

const PLAIN_TEXT: CodeLanguage = { value: '', label: 'Plain text' };

// grammars other grammars embed, highlighted when a fence names them but not offered in the menu
const EMBEDDED = new Set(['plaintext', 'php-template', 'python-repl']);

// highlight.js's names, where they read badly in the menu
const NAMES: Record<string, string> = { php: 'PHP' };

function nameOf(language: string): string | undefined {
  const grammar = hljs.getLanguage(language);
  if (!grammar) return undefined;
  const canonical = Object.keys(common).find((name) => hljs.getLanguage(name) === grammar);
  return (canonical && NAMES[canonical]) ?? grammar.name;
}

// the languages the code block's menu offers, by name, after Plain text
export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  PLAIN_TEXT,
  ...Object.keys(common)
    .filter((name) => !EMBEDDED.has(name))
    .map((name) => ({ value: name, label: nameOf(name) ?? name }))
    .sort((a, b) => a.label.localeCompare(b.label)),
];

// the name over a block whose fence says `language`: "TypeScript" for ts; the fence's own word
// for a language highlight.js doesn't know
export function languageLabel(language: string | null | undefined): string {
  if (!language) return PLAIN_TEXT.label;
  return nameOf(language) ?? language;
}

// the menu's value for a fence's language: ts and typescript are the same item
export function languageValue(language: string | null | undefined): string {
  if (!language) return '';
  const grammar = hljs.getLanguage(language);
  if (!grammar) return language;
  return (
    CODE_LANGUAGES.find((item) => item.value && hljs.getLanguage(item.value) === grammar)?.value ??
    language
  );
}
