import { z } from 'zod';

// The URLs that may be opened, shared by core, which checks before it opens one, and the renderer,
// which checks before it makes one clickable. The contract is in docs/security/untrusted-content.md.

/**
 * A URL that may be opened: an absolute http or https URL with a host (no javascript:, data:,
 * file: or app-specific schemes), normalised by the URL parser. A user name or password is
 * refused too, as it can disguise the host (https://bank.example@evil.example). Adding a scheme
 * is a security decision, not a convenience.
 */
export const safeUrlSchema = z
  // abort: the refine below only ever sees a URL that parsed
  .url({ protocol: /^https?$/, normalize: true, abort: true })
  .refine((href) => {
    const { username, password } = new URL(href);
    return username === '' && password === '';
  }, 'A URL with a user name or password cannot be opened');

// the URL, normalised, when safeUrlSchema accepts it; null for anything else
export function safeExternalUrl(value: string | null | undefined): string | null {
  return safeUrlSchema.safeParse(value).data ?? null;
}
