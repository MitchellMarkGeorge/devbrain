import { highlightToText } from '@renderer/editor/highlight';
import { isSearchHtml } from '../lib/results';
import styles from './SearchDialog.module.css';

/**
 * A search result's `title` or `body`: core's escaped text with each match in `<b>`, drawn with
 * the matches highlighted. The one place the renderer sets HTML (docs/security/untrusted-content.md):
 * it takes only a `SearchResult`'s own string, never one built from it, and checks it holds
 * nothing but escaped text and `<b>` first. Anything else is drawn as text.
 */
export function SearchHighlight({ html }: { html: string }) {
  if (!isSearchHtml(html)) return <span className={styles.highlight}>{highlightToText(html)}</span>;
  return <span className={styles.highlight} dangerouslySetInnerHTML={{ __html: html }} />;
}
