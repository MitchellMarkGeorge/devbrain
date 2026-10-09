import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { challengeFor, createPkce, createState } from '../../../integrations/oauth/pkce';

describe('OAuth — PKCE', () => {
  it('makes the challenge the base64url SHA-256 of the verifier', () => {
    const { verifier, challenge, method } = createPkce();
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe(expected);
    expect(challengeFor(verifier)).toBe(expected);
    expect(method).toBe('S256');
  });

  it('matches the RFC 7636 example', () => {
    expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('makes a fresh verifier and state each time, in the allowed characters', () => {
    const a = createPkce();
    const b = createPkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(createState()).not.toBe(createState());
    expect(createState()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
