import { IntegrationId } from '@common/ids';
import { integrations } from '@main/db/schema/integrations';
import { and, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { IntegrationAuthError, NotFoundError } from '../shared/errors';
import { TOKEN_REFRESH_MARGIN_MS } from '../sync/constants';
import {
  Auth,
  Credentials,
  OAuthCredentials,
  SealedCredentials,
  SecretCipher,
  TokenRefresher,
  toAuth,
} from './credentials';
import { AuthType, Provider } from './types';

export interface CredentialStoreOptions {
  cipher: SecretCipher;
  refreshers?: Partial<Record<Provider, TokenRefresher>>;
  now?: () => number; // injected for tests
}

// the decrypted JSON; times are ISO strings, as JSON has no dates
const storedCredentialsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(AuthType.API_KEY), apiKey: z.string().min(1) }),
  z.object({
    type: z.literal(AuthType.OAUTH),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.iso.datetime().nullable(),
  }),
]);

function serialize(credentials: Credentials): string {
  // fields are picked by hand, so only these are stored and expiresAt is written as an ISO string
  const stored: z.input<typeof storedCredentialsSchema> =
    credentials.type === AuthType.API_KEY
      ? { type: credentials.type, apiKey: credentials.apiKey }
      : {
          type: credentials.type,
          accessToken: credentials.accessToken,
          refreshToken: credentials.refreshToken,
          expiresAt: credentials.expiresAt?.toISOString() ?? null,
        };
  return JSON.stringify(stored);
}

// The only code that reads or writes integrations.credentials. Tokens never leave this class except
// as an Auth header value handed to a provider adapter.
export class CredentialStore {
  private readonly cipher: SecretCipher;
  private readonly refreshers: Partial<Record<Provider, TokenRefresher>>;
  private readonly now: () => number;
  // per-integration tail of the refresh queue, so two callers never refresh the same token at once
  private readonly locks = new Map<IntegrationId, Promise<unknown>>();

  constructor(
    private readonly db: BetterSQLite3Database,
    options: CredentialStoreOptions,
  ) {
    this.cipher = options.cipher;
    this.refreshers = options.refreshers ?? {};
    this.now = options.now ?? Date.now;
  }

  // Encryption is async and a better-sqlite3 transaction is not, so saving is two steps: seal
  // before the transaction, then save inside it, next to the insert or update it belongs with.
  async seal(credentials: Credentials): Promise<SealedCredentials> {
    if (!(await this.cipher.isAvailable())) {
      throw new IntegrationAuthError(
        "Secure storage isn't available on this system, so DevBrain can't store credentials",
      );
    }
    return (await this.cipher.encrypt(serialize(credentials))) as SealedCredentials;
  }

  save(integrationId: IntegrationId, sealed: SealedCredentials): void {
    const result = this.db
      .update(integrations)
      .set({ credentials: sealed })
      .where(eq(integrations.id, integrationId))
      .run();
    if (result.changes === 0) throw new NotFoundError(integrationId);
  }

  // leaves an empty blob, which getAuth reports as missing credentials
  clear(integrationId: IntegrationId): void {
    const result = this.db
      .update(integrations)
      .set({ credentials: Buffer.alloc(0) })
      .where(eq(integrations.id, integrationId))
      .run();
    if (result.changes === 0) throw new NotFoundError(integrationId);
  }

  async getAuth(integrationId: IntegrationId): Promise<Auth> {
    const current = await this.read(integrationId);
    if (!this.needsRefresh(current.credentials)) return toAuth(current.credentials);

    return this.withLock(integrationId, async () => {
      // another caller may have refreshed while this one waited for the lock
      const latest = await this.read(integrationId);
      if (!this.needsRefresh(latest.credentials)) return toAuth(latest.credentials);
      const { provider, blob, credentials } = latest;
      return toAuth(await this.refresh(integrationId, provider, blob, credentials));
    });
  }

  private async read(integrationId: IntegrationId): Promise<{
    provider: Provider;
    blob: Buffer;
    credentials: Credentials;
  }> {
    const row = this.db
      .select({ provider: integrations.provider, credentials: integrations.credentials })
      .from(integrations)
      .where(eq(integrations.id, integrationId))
      .get();
    if (!row) throw new NotFoundError(integrationId);

    const { credentials, shouldReEncrypt } = await this.decrypt(integrationId, row.credentials);
    if (!shouldReEncrypt) return { provider: row.provider, blob: row.credentials, credentials };

    // the key was rotated: store the same credentials under the new key
    const blob = await this.seal(credentials);
    this.replace(integrationId, row.credentials, blob);
    return { provider: row.provider, blob, credentials };
  }

  private needsRefresh(credentials: Credentials): credentials is OAuthCredentials {
    return (
      credentials.type === AuthType.OAUTH &&
      credentials.expiresAt !== null &&
      credentials.expiresAt.getTime() - this.now() <= TOKEN_REFRESH_MARGIN_MS
    );
  }

  private async refresh(
    integrationId: IntegrationId,
    provider: Provider,
    blob: Buffer,
    credentials: OAuthCredentials,
  ): Promise<OAuthCredentials> {
    const refresher = this.refreshers[provider];
    if (!refresher) {
      throw new IntegrationAuthError(`No token refresh is available for ${provider}`);
    }

    const tokens = await refresher(credentials.refreshToken);
    const refreshed: OAuthCredentials = {
      type: AuthType.OAUTH,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? credentials.refreshToken,
      expiresAt: tokens.expiresAt ?? null,
    };

    this.replace(integrationId, blob, await this.seal(refreshed));
    return refreshed;
  }

  // Writes only over the blob the caller started from. A save or clear that landed while a refresh
  // or re-encryption was in flight wins; the caller still uses what it has.
  private replace(integrationId: IntegrationId, previous: Buffer, next: SealedCredentials): void {
    this.db
      .update(integrations)
      .set({ credentials: next })
      .where(and(eq(integrations.id, integrationId), eq(integrations.credentials, previous)))
      .run();
  }

  // Any failure becomes an IntegrationAuthError, so a corrupt or foreign blob asks for a reconnect
  // instead of crashing a sync. Parse errors are not attached as the cause: they can quote the input.
  private async decrypt(
    integrationId: IntegrationId,
    blob: Buffer,
  ): Promise<{ credentials: Credentials; shouldReEncrypt: boolean }> {
    if (blob.length === 0) {
      throw new IntegrationAuthError(`No credentials are stored for ${integrationId}`);
    }

    let plain: string;
    let shouldReEncrypt: boolean;
    try {
      ({ result: plain, shouldReEncrypt } = await this.cipher.decrypt(blob));
    } catch (error) {
      throw new IntegrationAuthError(`Stored credentials for ${integrationId} can't be decrypted`, {
        cause: error,
      });
    }

    let json: unknown;
    try {
      json = JSON.parse(plain);
    } catch {
      throw new IntegrationAuthError(`Stored credentials for ${integrationId} are unreadable`);
    }

    const parsed = storedCredentialsSchema.safeParse(json);
    if (!parsed.success) {
      throw new IntegrationAuthError(`Stored credentials for ${integrationId} are unreadable`);
    }

    const stored = parsed.data;
    const credentials: Credentials =
      stored.type === AuthType.API_KEY
        ? stored
        : { ...stored, expiresAt: stored.expiresAt === null ? null : new Date(stored.expiresAt) };
    return { credentials, shouldReEncrypt };
  }

  private async withLock<T>(integrationId: IntegrationId, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(integrationId) ?? Promise.resolve();
    const run = previous.then(fn);
    // the queue moves on whether this run succeeds or fails
    const tail = run.catch(() => undefined);
    this.locks.set(integrationId, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(integrationId) === tail) this.locks.delete(integrationId);
    }
  }
}
