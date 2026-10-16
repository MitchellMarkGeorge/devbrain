import { safeExternalUrl } from '@common/safe-url';
import type { OpenExternal } from '../integrations/oauth/types';
import { UnsafeUrlError } from './errors';

// Core's side of the untrusted-content contract (docs/security/untrusted-content.md): escaping
// for the one field core hands out as HTML, and the check every URL passes before the injected
// browser opener sees it.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// text made safe to put in HTML, as element content or a quoted attribute value
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * The browser opener, behind the URL allow-list: opens only what `safeExternalUrl` accepts, in its
 * normalised form, and throws UnsafeUrlError, having opened nothing, for anything else. Every
 * opener core is given goes through this, so a provider's `javascript:` or `file:` link can never
 * reach shell.openExternal.
 */
export function guardOpenExternal(open: OpenExternal): OpenExternal {
  return async (url) => {
    const safe = safeExternalUrl(url);
    if (safe === null) throw new UnsafeUrlError();
    await open(safe);
  };
}
