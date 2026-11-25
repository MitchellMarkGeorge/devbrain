import { Lexer, Marked, type TokenizerExtension, type TokenizerThis } from 'marked';
import type { MarkdownToken, MarkdownTokenizer, TokenizerHelpers } from './types';

/**
 * The `marked` instance notes are read with: GitHub-flavoured markdown and the tokenizers of the
 * rules (`rules.ts`), on an instance of its own, so nothing else that uses `marked` reads notes'
 * syntax or changes how they are read. Made once: the tokenizers are fixed.
 */
export function createMarked(tokenizers: MarkdownTokenizer[]): Marked {
  const marked = new Marked({ gfm: true });
  const block = tokenizers.filter((tokenizer) => tokenizer.level === 'block');

  // what a tokenizer gets to read what's inside its token, from the lexer it runs in
  const helpersFor = (lexer: Lexer): TokenizerHelpers => ({
    inlineTokens: (src) => lexer.inlineTokens(src) as MarkdownToken[],
    blockTokens: (src) => {
      // reading a block's body leaves the lexer as it was: still at the top level if it was
      const wasTopLevel = lexer.state.top;
      try {
        return lexer.blockTokens(src) as MarkdownToken[];
      } finally {
        lexer.state.top = wasTopLevel;
      }
    },
    isParagraphContinuation: (line) => {
      // `marked` alone reads the line as part of a paragraph...
      const probe = new Lexer({ ...marked.defaults, extensions: null, tokenizer: null });
      const source = `text\n${line}\n`;
      const token = probe.blockTokens(source)[0];
      if (token?.type !== 'paragraph' || token.raw !== source) return false;
      // ...and no tokenizer of ours starts a block with it
      const extensionLexer = new Lexer(marked.defaults);
      extensionLexer.state.top = lexer.state.top;
      if (block.some((tokenizer) => tokenizer.start(line) >= 0)) return false;
      return !block.some((tokenizer) => run(tokenizer, extensionLexer, `${line}\n`, []));
    },
  });

  function run(
    tokenizer: MarkdownTokenizer,
    lexer: Lexer,
    src: string,
    tokens: MarkdownToken[],
  ): MarkdownToken | undefined {
    const result = tokenizer.tokenize(src, tokens, helpersFor(lexer));
    if (!result || !result.type) return undefined;
    return { ...result, raw: result.raw || '', tokens: result.tokens || [] };
  }

  const extensions: TokenizerExtension[] = tokenizers.map((tokenizer) => ({
    name: tokenizer.name,
    level: tokenizer.level,
    start: (src: string) => tokenizer.start(src),
    tokenizer(this: TokenizerThis, src: string, tokens: unknown[]) {
      return run(tokenizer, this.lexer as Lexer, src, tokens as MarkdownToken[]);
    },
    childTokens: [],
  }));
  marked.use({ extensions });
  return marked;
}

/** A lexer reading with `marked`'s options and tokenizers. */
export function createLexer(marked: Marked): Lexer {
  return new Lexer(marked.defaults);
}
