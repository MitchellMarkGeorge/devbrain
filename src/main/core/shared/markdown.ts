/**
 * Converts markdown to plain text.
 *
 * Adapted from the `remove-markdown` npm package (MIT License, Copyright (c)
 * 2015 Stian Grytøyr — https://github.com/stiang/remove-markdown), brought
 * in-house so we control it directly instead of carrying a private patch of
 * a third-party dependency. Three behavioral changes were made relative to
 * the original; everything else (headers, emphasis, blockquotes, images,
 * HTML tags, footnotes, reference-style links, etc.) is carried over as-is.
 *
 * 1. Native GitHub-flavored task list support (new). The original has no
 *    concept of task list checkboxes ("- [ ] " / "- [x] ") at all — it only
 *    strips the leading bullet, leaving "[ ] " / "[x] " behind in the
 *    output. We now also strip the checkbox itself, gated behind the `gfm`
 *    option since task lists are a GFM extension, not core Markdown.
 *
 * 2. Fixed a real bug in "remove inline links" ([text](url)). The original
 *    matched the link text with `[([\s\S]*?)]` — a *lazy* group allowed to
 *    span newlines. When the input contains any unmatched "[...]" the
 *    original doesn't otherwise recognize — exactly what a task list
 *    checkbox looks like before change #1 above is applied — that lazy
 *    group doesn't stop at the nearest "]": it keeps expanding across every
 *    following line hunting for a "]" that *is* followed by "(" or "[",
 *    i.e. the next real link anywhere later in the document. Everything in
 *    between (every task item, and any real prose separating them) gets
 *    swallowed into one bogus match and discarded. Both capture groups are
 *    now bounded to `[^\]]*` / `[^)\]]*` instead, so a match can never cross
 *    a "]" it doesn't own — the same technique the original already uses
 *    one branch above, in `separateLinksAndTexts`.
 *
 * 3. Fixed tilde-fenced code blocks (~~~). The original matched fences with
 *    `/~{3}.*\n/g`, which strips a "~~~" line only when it's followed by a
 *    newline — so the *closing* fence survives untouched whenever it's the
 *    last line of the input, and the code content between the fences was
 *    never actually captured/trimmed at all. Rewritten to match the opening
 *    and closing fence as a pair and trim the content between them —
 *    exactly what the backtick-fence rule two lines below it already does
 *    correctly.
 */

export interface StripMarkdownOptions {
  listUnicodeChar?: string | false;
  stripListLeaders?: boolean;
  gfm?: boolean;
  useImgAltText?: boolean;
  abbr?: boolean;
  replaceLinksWithURL?: boolean;
  separateLinksAndTexts?: string | null;
  htmlTagsToSkip?: string[];
  throwError?: boolean;
}

const DEFAULT_OPTIONS: Required<StripMarkdownOptions> = {
  listUnicodeChar: false,
  stripListLeaders: true,
  gfm: true,
  useImgAltText: true,
  abbr: false,
  replaceLinksWithURL: false,
  separateLinksAndTexts: null,
  htmlTagsToSkip: [],
  throwError: false,
};

export function stripMarkdown(markdown: string, options: StripMarkdownOptions = {}): string {
  const opts: Required<StripMarkdownOptions> = { ...DEFAULT_OPTIONS, ...options };

  let output = markdown || '';

  // Remove horizontal rules (stripListLeaders conflicts with this rule, which is why it's handled first)
  output = output.replace(
    /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/gm,
    '',
  );

  try {
    if (opts.stripListLeaders) {
      output = opts.listUnicodeChar
        ? output.replace(/^([\s\t]*)([*\-+]|\d+\.)\s+/gm, `${opts.listUnicodeChar} $1`)
        : output.replace(/^([\s\t]*)([*\-+]|\d+\.)\s+/gm, '$1');
    }

    if (opts.gfm) {
      output = output
        // Header
        .replace(/\n={2,}/g, '\n')
        // [CHANGED] Fenced codeblocks with tildes — matches the opening and
        // closing fence as a pair and trims the content between them (see
        // file header, change #3), instead of the original's `/~{3}.*\n/g`.
        .replace(/~~~(?:.*)\n([\s\S]*?)~~~/g, (_, code: string) => code.trim())
        // Strikethrough
        .replace(/~~/g, '')
        // Fenced codeblocks with backticks
        .replace(/```(?:.*)\n([\s\S]*?)```/g, (_, code: string) => code.trim())
        // [ADDED] GFM task list checkboxes ("- [ ] " / "1. [x] "): the
        // bullet/ordinal is already gone by this point (stripListLeaders
        // above), so a task item now starts its line with just "[ ] " or
        // "[x] " — strip that too. Left alone, it would otherwise be fed to
        // "remove inline links" below, which doesn't understand it either
        // (see file header, change #2, for what that used to do).
        .replace(/^(\s*)\[[ xX]\]\s+/gm, '$1');
    }

    if (opts.abbr) {
      // Remove abbreviations
      output = output.replace(/\*\[.*\]:.*\n/, '');
    }

    let htmlReplaceRegex = /<[^>]*>/g;
    if (opts.htmlTagsToSkip.length > 0) {
      // Create a regex that matches tags not in htmlTagsToSkip
      const joinedHtmlTagsToSkip = opts.htmlTagsToSkip.join('|');
      htmlReplaceRegex = new RegExp(`<(?!/?(${joinedHtmlTagsToSkip})(?=>|\\s[^>]*>))[^>]*>`, 'g');
    }

    if (opts.separateLinksAndTexts) {
      output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `$1${opts.separateLinksAndTexts}$2`);
    }

    output = output
      // Remove HTML tags
      .replace(htmlReplaceRegex, '')
      // Remove setext-style headers
      .replace(/^[=-]{2,}\s*$/g, '')
      // Remove footnotes?
      .replace(/\[\^.+?\](: .*?$)?/g, '')
      .replace(/\s{0,2}\[.*?\]: .*?$/g, '')
      // Remove images
      .replace(/!\[(.*?)\][[(].*?[\])]/g, opts.useImgAltText ? '$1' : '')
      // [CHANGED] Remove inline links — bounded to `[^\]]*` / `[^)\]]*`
      // instead of the original's `[\s\S]*?` / `.*?` (see file header,
      // change #2).
      .replace(/\[([^\]]*)\]\s*[[(]([^)\]]*)[)\]]/g, opts.replaceLinksWithURL ? '$2' : '$1')
      // Remove blockquotes
      .replace(/^(\n)?\s{0,3}>\s?/gm, '$1')
      // Remove reference-style links?
      .replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, '')
      // Remove atx-style headers
      .replace(/^(\n)?\s{0,}#{1,6}\s*( (.+))? +#+$|^(\n)?\s{0,}#{1,6}\s*( (.+))?$/gm, '$1$3$4$6')
      // Remove * emphasis
      .replace(/(\*+)(\S)(.*?\S)??\1/g, '$2$3')
      // Remove _ emphasis. Unlike *, _ emphasis gets rendered only if
      //   1. Either there is a whitespace character before opening _ and after closing _.
      //   2. Or _ is at the start/end of the string.
      .replace(/(^|\W)(_+)(\S)(.*?\S)??\2($|\W)/g, '$1$3$4$5')
      // Remove single-line code blocks (already handled multiline above in gfm section)
      .replace(/(`{3,})(.*?)\1/gm, '$2')
      // Remove inline code
      .replace(/`(.+?)`/g, '$1')
      // Replace strike through
      .replace(/~(.*?)~/g, '$1');
  } catch (err) {
    if (opts.throwError) throw err;

    console.error('stripMarkdown encountered an error:', err);
    return markdown;
  }

  return output;
}
