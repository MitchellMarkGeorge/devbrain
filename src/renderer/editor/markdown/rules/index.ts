import { calloutMarkdown } from '../../extensions/callout';
import { entityLinkMarkdown } from '../../extensions/entity-link';
import {
  detailsMarkdown,
  htmlBreakMarkdown,
  kbdMarkdown,
  subscriptMarkdown,
  superscriptMarkdown,
  underlineMarkdown,
} from '../../extensions/html-elements';
import { imageLinkMarkdown } from '../../extensions/image-link';
import { rawHtmlBlockMarkdown, rawHtmlInlineMarkdown } from '../../extensions/raw-html';
import { safeLinkMarkdown } from '../../extensions/safe-link';
import { blockRules } from './blocks';
import { listRules } from './lists';
import { markRules } from './marks';
import { tableRules } from './tables';
import type { MarkdownRule, MarkdownTokenizer } from '../types';

/**
 * Every node's and mark's markdown, in one table: how each is read from `marked`'s tokens and
 * written back. The rules for the nodes and marks TipTap's extensions give the schema are here
 * (blocks.ts, lists.ts, marks.ts and tables.ts); those for DevBrain's own nodes are beside the
 * node they read, in extensions/, and listed here.
 *
 * The order matters in two places: a token type several rules read (`list`) goes to the first that makes something of it,
 * and where two tokenizers match at one place, the later one in this list wins (`marked` runs the
 * last added first): raw HTML is tried before the tags it leaves to html-elements.ts.
 */
export const DOCUMENT_RULES: MarkdownRule[] = [
  blockRules.paragraph,
  safeLinkMarkdown,
  markRules.bold,
  blockRules.blockquote,
  listRules.bulletList,
  markRules.code,
  blockRules.doc,
  blockRules.hardBreak,
  blockRules.heading,
  blockRules.horizontalRule,
  markRules.italic,
  listRules.listItem,
  listRules.orderedList,
  markRules.strike,
  blockRules.text,
  blockRules.codeBlock,
  listRules.taskList,
  listRules.taskItem,
  tableRules.table,
  entityLinkMarkdown,
  imageLinkMarkdown,
  calloutMarkdown,
  underlineMarkdown,
  kbdMarkdown,
  subscriptMarkdown,
  superscriptMarkdown,
  htmlBreakMarkdown,
  detailsMarkdown,
  rawHtmlBlockMarkdown,
  rawHtmlInlineMarkdown,
];

/** The rules looked up by the token type they read and by the node or mark they write. */
export class RuleTable {
  private readonly parsers = new Map<string, MarkdownRule[]>();
  private readonly renderers = new Map<string, MarkdownRule>();
  readonly tokenizers: MarkdownTokenizer[];

  constructor(rules: MarkdownRule[]) {
    for (const rule of rules) {
      if (rule.parse) {
        const token = rule.token ?? rule.name;
        this.parsers.set(token, [...(this.parsers.get(token) ?? []), rule]);
      }
      if (rule.render && !this.renderers.has(rule.name)) this.renderers.set(rule.name, rule);
    }
    this.tokenizers = rules.flatMap((rule) => (rule.tokenizer ? [rule.tokenizer] : []));
  }

  parsersOf(tokenType: string): MarkdownRule[] {
    return this.parsers.get(tokenType) ?? [];
  }

  rendererOf(name: string): MarkdownRule | undefined {
    return this.renderers.get(name);
  }
}
