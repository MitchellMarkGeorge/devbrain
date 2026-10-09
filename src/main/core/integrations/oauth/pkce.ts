import { createHash, randomBytes } from 'node:crypto';

// PKCE (RFC 7636) and the state parameter. A stolen authorization code is useless without the
// verifier, which never leaves this process; state ties the callback to the request we made.

export interface Pkce {
  verifier: string;
  challenge: string;
  method: 'S256';
}

// 32 random bytes give a 43-character verifier, the shortest RFC 7636 allows
export function createPkce(): Pkce {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: challengeFor(verifier), method: 'S256' };
}

// the base64url SHA-256 of the verifier, without padding
export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function createState(): string {
  return randomBytes(16).toString('base64url');
}
