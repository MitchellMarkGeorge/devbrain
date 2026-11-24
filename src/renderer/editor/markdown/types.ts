import type { JSONContent } from '@tiptap/core';

/**
 * The types of DevBrain's markdown layer (docs/editor.md, "The markdown layer"): a token `marked`
 * read, what a rule makes of it, and what a rule is given to read tokens and write nodes.
 */

/** A token as `marked` reads it, or as a tokenizer of ours makes it; `raw` is its source text. */
export interface MarkdownToken {
  type: string;
  raw: string;
  text?: string;
  tokens?: MarkdownToken[];
  // what each kind of token carries besides (a list's `items`, a link's `href`, …)
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** The link reference definitions `marked` read in a text, by label as it keys them. */
export type LinkDefinitions = Record<string, { href: string; title?: string | null }>;

/** A top-level token, the nodes it gave, and where its `raw` stands in the text. */
export interface TokenRead {
  token: MarkdownToken;
  // none for a definition or the blank line between two blocks, empty paragraphs for the blank
  // lines beyond it, several for a list split into to-do and bullet lists
  nodes: JSONContent[];
  from: number;
  to: number;
  // a definition of a label defined before it, which `marked` reads and gives no token for
  repeated?: boolean;
}

/** A text as the parser read it (`MarkdownParser.read`). */
export interface ParsedText {
  doc: JSONContent;
  // the text with `\n` line ends, which the tokens' offsets are in
  text: string;
  // covering `text` end to end; null when the tokens couldn't be lined up with it
  tokens: TokenRead[] | null;
  // every definition read, wherever it stands (in a quote or a list item too)
  links: LinkDefinitions;
}

/** A mark to put on the nodes read from a token's children (`**bold**` is `bold` on its text). */
export interface MarkResult {
  mark: string;
  content: JSONContent[];
  attrs?: Record<string, unknown>;
}

export type ParseResult = JSONContent | JSONContent[] | MarkResult | null | undefined;

export interface ParseHelpers {
  // a run of inline tokens as text nodes and inline nodes, with their marks
  parseInline(tokens: MarkdownToken[]): JSONContent[];
  // inline markdown read into tokens, with the reference links of the text being read
  tokenizeInline(src: string): MarkdownToken[];
  parseChildren(tokens: MarkdownToken[]): JSONContent[];
  // block tokens, with blank lines read as empty paragraphs as at the top of a document
  parseBlockChildren(tokens: MarkdownToken[]): JSONContent[];
  createTextNode(text: string, marks?: JSONContent['marks']): JSONContent;
  createNode(type: string, attrs?: Record<string, unknown>, content?: JSONContent[]): JSONContent;
  applyMark(mark: string, content: JSONContent[], attrs?: Record<string, unknown>): MarkResult;
}

export interface RenderHelpers {
  // children written one after another, joined by `separator`; a node's own content when given one
  renderChildren(nodes: JSONContent | JSONContent[], separator?: string): string;
  renderChild(node: JSONContent, index: number): string;
  indent(content: string): string;
  wrapInBlock(prefix: string, content: string): string;
}

export interface RenderContext {
  index: number;
  level: number;
  parentType?: string;
  previousNode?: JSONContent;
  meta: {
    parentAttrs?: Record<string, unknown>;
    // for a mark: the whole text it spans, not just the text node being written
    markText?: string;
  };
}

/** What a tokenizer is given to read the text inside its token. */
export interface TokenizerHelpers {
  inlineTokens(src: string): MarkdownToken[];
  blockTokens(src: string): MarkdownToken[];
  // whether `line`, after a paragraph's first line, carries on that paragraph
  isParagraphContinuation(line: string): boolean;
}

/** A `marked` extension of ours: syntax `marked` doesn't read itself. */
export interface MarkdownTokenizer {
  name: string;
  level: 'block' | 'inline';
  // where in `src` the syntax could start, for `marked` to stop text there; -1 for nowhere
  start(src: string): number;
  tokenize(
    src: string,
    tokens: MarkdownToken[],
    helpers: TokenizerHelpers,
  ): MarkdownToken | undefined | void;
}

/**
 * How one node or mark is read and written. `name` is its name in the schema; `token` the token
 * type it is read from (its name when left out); several rules can read one type (`list` is a
 * bullet or a numbered list), and the first to make something of a token wins.
 */
export interface MarkdownRule {
  name: string;
  token?: string;
  parse?(token: MarkdownToken, helpers: ParseHelpers): ParseResult;
  // a node's markdown; a mark's around a placeholder for its text
  render?(node: JSONContent, helpers: RenderHelpers, context: RenderContext): string;
  tokenizer?: MarkdownTokenizer;
  // its children are one level deeper (list items)
  indentsContent?: boolean;
  // a mark reopened with HTML where marks overlap, so it can't be markdown
  htmlReopen?: { open: string; close: string };
  // an inline node that keeps a link put around it (an image: `[![alt](src)](href)`)
  linkable?: boolean;
}
