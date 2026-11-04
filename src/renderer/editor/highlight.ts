const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/**
 * A search title as text: core escapes it and wraps the matches in <b>…</b>, the only markup it
 * holds (docs/security/untrusted-content.md), so dropping those tags and unescaping gives the
 * title back. The result is text, rendered as a text node.
 */
export function highlightToText(html: string): string {
  return html.replace(/<\/?b>/g, '').replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]);
}
