import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inspect } from 'node:util';
import { NodeSQLiteDatabase } from '@main/db/node-sqlite';
import { eq } from 'drizzle-orm';
import { IntegrationId } from '@common/ids';
import { integrations } from '@main/db/schema/integrations';
import { createDb } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { CredentialStore } from '../../integrations/credential-store';
import {
  ApiKeyCredentials,
  OAuthCredentials,
  RefreshedTokens,
  TokenRefresher,
} from '../../integrations/credentials';
import { AuthType, Provider } from '../../integrations/types';
import { IntegrationAuthError, NotFoundError } from '../../shared/errors';
import { TOKEN_REFRESH_MARGIN_MS } from '../../sync/constants';

const API_KEY = 'lin_api_supersecretkey';
const ACCESS_TOKEN = 'ya29.access-secret';
const REFRESH_TOKEN = '1//refresh-secret';
const NOW = new Date('2026-10-07T12:00:00Z').getTime();

// IntegrationService does not exist yet, so rows go in directly with an empty blob
function insertIntegration(db: NodeSQLiteDatabase, provider = Provider.LINEAR): IntegrationId {
  const [row] = db
    .insert(integrations)
    .values({
      provider,
      authType: AuthType.API_KEY,
      accountId: `account-${Math.random()}`,
      accountLabel: 'Ada, Acme',
      credentials: Buffer.alloc(0),
    })
    .returning()
    .all();
  return row.id;
}

function storedBlob(db: NodeSQLiteDatabase, id: IntegrationId): Buffer {
  return db
    .select({ credentials: integrations.credentials })
    .from(integrations)
    .where(eq(integrations.id, id))
    .get()!.credentials;
}

function apiKeyCredentials(apiKey: string): ApiKeyCredentials {
  return { type: AuthType.API_KEY, apiKey };
}

function oauthCredentials(tokens: Omit<OAuthCredentials, 'type'>): OAuthCredentials {
  return { type: AuthType.OAUTH, ...tokens };
}

async function decryptStored(cipher: FakeCipher, db: NodeSQLiteDatabase, id: IntegrationId) {
  return JSON.parse((await cipher.decrypt(storedBlob(db, id))).result);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('CredentialStore — storage', () => {
  let db: NodeSQLiteDatabase;
  let cipher: FakeCipher;
  let store: CredentialStore;
  let id: IntegrationId;

  beforeEach(() => {
    db = createDb();
    cipher = new FakeCipher();
    store = new CredentialStore(db, { cipher });
    id = insertIntegration(db);
  });

  it('round-trips an API key', async () => {
    store.save(id, await store.seal(apiKeyCredentials(API_KEY)));
    expect(await store.getAuth(id)).toEqual({ authorization: API_KEY });
  });

  it('round-trips OAuth credentials as a bearer header', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const credentials = oauthCredentials({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      expiresAt,
    });
    store.save(id, await store.seal(credentials));
    expect(await store.getAuth(id)).toEqual({ authorization: `Bearer ${ACCESS_TOKEN}` });
    expect((await decryptStored(cipher, db, id)).expiresAt).toBe(expiresAt.toISOString());
  });

  it('does not store the plain key', async () => {
    store.save(id, await store.seal(apiKeyCredentials(API_KEY)));
    const blob = storedBlob(db, id);
    expect(blob.length).toBeGreaterThan(0);
    expect(blob.includes(API_KEY)).toBe(false);
    expect(blob.toString('utf8')).not.toContain(API_KEY);
  });

  it('refuses to seal when the cipher is unavailable, and leaves the row alone', async () => {
    cipher.available = false;
    const sealing = store.seal(apiKeyCredentials(API_KEY));
    await expect(sealing).rejects.toThrow(IntegrationAuthError);
    await expect(sealing).rejects.toThrow(/Secure storage/);
    expect(storedBlob(db, id).length).toBe(0);
  });

  it('saves inside a caller transaction, and rolls back with it', async () => {
    const sealed = await store.seal(apiKeyCredentials(API_KEY));
    expect(() =>
      db.transaction(() => {
        store.save(id, sealed);
        throw new Error('connect failed');
      }),
    ).toThrow('connect failed');
    expect(storedBlob(db, id).length).toBe(0);

    db.transaction(() => store.save(id, sealed));
    expect(await store.getAuth(id)).toEqual({ authorization: API_KEY });
  });

  it('throws NotFoundError for an unknown integration', async () => {
    const missing = 'int_missing' as IntegrationId;
    const sealed = await store.seal(apiKeyCredentials(API_KEY));
    expect(() => store.save(missing, sealed)).toThrow(NotFoundError);
    expect(() => store.clear(missing)).toThrow(NotFoundError);
    await expect(store.getAuth(missing)).rejects.toThrow(NotFoundError);
  });

  it('clears credentials, after which getAuth asks for a reconnect', async () => {
    store.save(id, await store.seal(apiKeyCredentials(API_KEY)));
    store.clear(id);
    expect(storedBlob(db, id).length).toBe(0);
    await expect(store.getAuth(id)).rejects.toThrow(IntegrationAuthError);
  });

  it('re-encrypts a blob under a rotated key on read', async () => {
    store.save(id, await store.seal(apiKeyCredentials(API_KEY)));
    const before = storedBlob(db, id);
    cipher.keyVersion = 2;

    expect(await store.getAuth(id)).toEqual({ authorization: API_KEY });
    const after = storedBlob(db, id);
    expect(after.equals(before)).toBe(false);
    expect(await cipher.decrypt(after)).toEqual({
      result: JSON.stringify({ type: 'api_key', apiKey: API_KEY }),
      shouldReEncrypt: false,
    });
  });
});

describe('CredentialStore — corrupt blobs', () => {
  let db: NodeSQLiteDatabase;
  let cipher: FakeCipher;
  let store: CredentialStore;
  let id: IntegrationId;

  function setBlob(blob: Buffer) {
    db.update(integrations).set({ credentials: blob }).where(eq(integrations.id, id)).run();
  }

  beforeEach(() => {
    db = createDb();
    cipher = new FakeCipher();
    store = new CredentialStore(db, { cipher });
    id = insertIntegration(db);
  });

  it('raises IntegrationAuthError for a blob that does not decrypt', async () => {
    setBlob(Buffer.from('not ciphertext'));
    await expect(store.getAuth(id)).rejects.toThrow(IntegrationAuthError);
  });

  it('raises IntegrationAuthError for ciphertext that is not JSON, without quoting it', async () => {
    setBlob(await cipher.encrypt(`{"apiKey":"${API_KEY}"`));
    const error = await store.getAuth(id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IntegrationAuthError);
    expect(inspect(error)).not.toContain(API_KEY);
  });

  it('raises IntegrationAuthError for JSON of the wrong shape', async () => {
    setBlob(await cipher.encrypt(JSON.stringify({ type: 'api_key' })));
    await expect(store.getAuth(id)).rejects.toThrow(IntegrationAuthError);
    setBlob(await cipher.encrypt(JSON.stringify({ type: 'password', password: 'x' })));
    await expect(store.getAuth(id)).rejects.toThrow(IntegrationAuthError);
    setBlob(
      await cipher.encrypt(
        JSON.stringify({ type: 'oauth', accessToken: 'a', refreshToken: 'r', expiresAt: 'soon' }),
      ),
    );
    await expect(store.getAuth(id)).rejects.toThrow(IntegrationAuthError);
  });
});

describe('CredentialStore — refresh', () => {
  let db: NodeSQLiteDatabase;
  let cipher: FakeCipher;
  let now: number;
  let id: IntegrationId;

  function storeWith(refresher?: TokenRefresher) {
    return new CredentialStore(db, {
      cipher,
      refreshers: refresher ? { [Provider.GOOGLE_CALENDAR]: refresher } : {},
      now: () => now,
    });
  }

  async function saveToken(store: CredentialStore, expiresInMs: number | null) {
    const credentials = oauthCredentials({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      expiresAt: expiresInMs === null ? null : new Date(now + expiresInMs),
    });
    store.save(id, await store.seal(credentials));
  }

  beforeEach(() => {
    db = createDb();
    cipher = new FakeCipher();
    now = NOW;
    id = insertIntegration(db, Provider.GOOGLE_CALENDAR);
  });

  it('does not refresh a token with more than the margin left', async () => {
    const refresher = vi.fn<TokenRefresher>();
    const store = storeWith(refresher);
    await saveToken(store, TOKEN_REFRESH_MARGIN_MS + 1000);
    expect(await store.getAuth(id)).toEqual({ authorization: `Bearer ${ACCESS_TOKEN}` });
    await saveToken(store, null);
    expect(await store.getAuth(id)).toEqual({ authorization: `Bearer ${ACCESS_TOKEN}` });
    expect(refresher).not.toHaveBeenCalled();
  });

  it('refreshes a token inside the margin and stores the result', async () => {
    const expiresAt = new Date(NOW + 60 * 60 * 1000);
    const refresher = vi.fn<TokenRefresher>().mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt,
    });
    const store = storeWith(refresher);
    await saveToken(store, TOKEN_REFRESH_MARGIN_MS);

    expect(await store.getAuth(id)).toEqual({ authorization: 'Bearer new-access' });
    expect(refresher).toHaveBeenCalledWith(REFRESH_TOKEN);
    expect(await decryptStored(cipher, db, id)).toEqual({
      type: 'oauth',
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: expiresAt.toISOString(),
    });

    // the stored token is now fresh, so the next call does not refresh
    expect(await store.getAuth(id)).toEqual({ authorization: 'Bearer new-access' });
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('keeps the old refresh token when the response omits one', async () => {
    const store = storeWith(async () => ({ accessToken: 'new-access', expiresAt: null }));
    await saveToken(store, -1000);
    await store.getAuth(id);
    expect((await decryptStored(cipher, db, id)).refreshToken).toBe(REFRESH_TOKEN);
  });

  it('refreshes once when two callers ask at the same time', async () => {
    const pending = deferred<RefreshedTokens>();
    const refresher = vi.fn<TokenRefresher>().mockReturnValue(pending.promise);
    const store = storeWith(refresher);
    await saveToken(store, 1000);

    const first = store.getAuth(id);
    const second = store.getAuth(id);
    await vi.waitFor(() => expect(refresher).toHaveBeenCalledTimes(1));
    pending.resolve({ accessToken: 'new-access', expiresAt: new Date(NOW + 60 * 60 * 1000) });

    expect(await Promise.all([first, second])).toEqual([
      { authorization: 'Bearer new-access' },
      { authorization: 'Bearer new-access' },
    ]);
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('refreshes each integration independently', async () => {
    const other = insertIntegration(db, Provider.GOOGLE_CALENDAR);
    const refresher = vi.fn<TokenRefresher>().mockResolvedValue({ accessToken: 'new-access' });
    const store = storeWith(refresher);
    await saveToken(store, 0);
    const credentials = oauthCredentials({ accessToken: 'a', refreshToken: 'r', expiresAt: null });
    store.save(other, await store.seal(credentials));

    await Promise.all([store.getAuth(id), store.getAuth(other)]);
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it('passes a failed refresh on, and lets the next caller try again', async () => {
    const refresher = vi
      .fn<TokenRefresher>()
      .mockRejectedValueOnce(new IntegrationAuthError('invalid_grant'))
      .mockResolvedValueOnce({ accessToken: 'new-access' });
    const store = storeWith(refresher);
    await saveToken(store, 0);

    await expect(store.getAuth(id)).rejects.toThrow(IntegrationAuthError);
    expect((await decryptStored(cipher, db, id)).accessToken).toBe(ACCESS_TOKEN);
    expect(await store.getAuth(id)).toEqual({ authorization: 'Bearer new-access' });
  });

  it('raises IntegrationAuthError when the provider has no refresher', async () => {
    const store = storeWith();
    await saveToken(store, 0);
    await expect(store.getAuth(id)).rejects.toThrow(IntegrationAuthError);
  });

  it('does not overwrite credentials saved while a refresh was out', async () => {
    const pending = deferred<RefreshedTokens>();
    const refresher = vi.fn<TokenRefresher>().mockReturnValue(pending.promise);
    const store = storeWith(refresher);
    await saveToken(store, 0);

    const auth = store.getAuth(id);
    await vi.waitFor(() => expect(refresher).toHaveBeenCalled());
    // a reconnect lands before the refresh returns
    const reconnected = oauthCredentials({
      accessToken: 'reconnected',
      refreshToken: 'r2',
      expiresAt: null,
    });
    store.save(id, await store.seal(reconnected));
    pending.resolve({ accessToken: 'new-access' });

    expect(await auth).toEqual({ authorization: 'Bearer new-access' });
    expect((await decryptStored(cipher, db, id)).accessToken).toBe('reconnected');
  });
});
