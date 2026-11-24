import { TaskList } from '@tiptap/extension-list';
import type { MarkdownTokenizer } from '@tiptap/core';

// the line TipTap's task list tokenizer reads as an item (its `itemPattern`), after any blank lines
const STARTS_WITH_TASK_ITEM = /^(?:[^\S\n]*\n)*[^\S\n]*[-+*][^\S\n]+\[[ xX]\][^\S\n]+/;

const tiptapTokenizer = TaskList.config.markdownTokenizer as MarkdownTokenizer;

/**
 * TipTap's task list, read and written the same, with a tokenizer that gives up at once on
 * markdown that doesn't start with a task item.
 *
 * Marked tries every block tokenizer at each block of the note. TipTap's (parseIndentedBlocks in
 * @tiptap/core) splits all the rest of the source into lines before it looks at the first one, so
 * each try costs the length of the rest of the note and lexing a note took time quadratic in its
 * length. This makes the check that function makes first (skip blank lines, then the first line
 * must be an item) before calling it, so it only runs where a task list starts.
 */
export const DocumentTaskList = TaskList.extend({
  markdownTokenizer: {
    ...tiptapTokenizer,
    tokenize(src, tokens, lexer) {
      if (!STARTS_WITH_TASK_ITEM.test(src)) return undefined;
      return tiptapTokenizer.tokenize(src, tokens, lexer);
    },
  },
});
