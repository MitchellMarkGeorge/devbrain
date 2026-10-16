// Checks for values that came from a provider, or that the user typed, before they are used as
// anything but text. Shared by core, which checks before it opens a URL, and the renderer, which
// checks before it makes one clickable or uses a colour. The contract is in
// docs/security/untrusted-content.md.

// the only schemes a link may have: no javascript:, data:, file:, or app-specific ones
export const SAFE_URL_PROTOCOLS: readonly string[] = ['http:', 'https:'];

/**
 * The URL, normalised, when it may be opened: an absolute http or https URL with a host and no
 * user name or password (which can disguise the host, as in https://bank.com@evil.example).
 * Null for anything else, including a relative URL or one that does not parse.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!SAFE_URL_PROTOCOLS.includes(url.protocol)) return null;
  if (url.hostname === '' || url.username !== '' || url.password !== '') return null;
  return url.href;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// a colour as #rrggbb, the only form safe to put in a style; null for anything else
export function safeHexColor(value: string | null | undefined): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null;
}
