import { IntegrationId } from '@common/ids';
import { integrations } from '@main/db/schema/integrations';
import { and, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { IntegrationAuthError, NotFoundError } from '../shared/errors';
import { TOKEN_REFRESH_MARGIN_MS } from '../sync/constants';
import { AuthType, Provider } from './types';

// Encrypts secrets at rest. The main process passes one over Electron's safeStorage; tests pass a
// reversible fake. Core never imports Electron.
export interface SecretCipher {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

export interface ApiKeyCredentials {
  type: AuthType.API_KEY;
  apiKey: string;
}

export interface OAuthCredentials {
  type: AuthType.OAUTH;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null; // null when the provider gave no lifetime; never refreshed early
}

export type Credentials = ApiKeyCredentials | OAuthCredentials;

// what a provider adapter is handed for a request: the Authorization header value, nothing else
export interface Auth {
  authorization: string;
}

// what a provider's refresh call returns; a missing refresh token keeps the stored one
export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
}

// one per provider, implemented in feature 16. Throws IntegrationAuthError when the grant is
// rejected, so the caller can move the integration to needs_reauth.
export type TokenRefresher = (refreshToken: string) => Promise<RefreshedTokens>;

export interface CredentialStoreOptions {
  cipher: SecretCipher;
  refreshers?: Partial<Record<Provider, TokenRefresher>>;
  now?: () => number; // injected for tests
}

const REDACTED = '[redacted]';
const inspectSymbol = Symbol.for('nodejs.util.inspect.custom');

// Gives a secret-bearing object a toJSON and a util.inspect hook that hide its secrets, so logging
// it (electron-log, console, an error's cause) never prints a token. Both are non-enumerable, so
// equality checks and spreads ignore them.
function redact<T extends object>(value: T, safe: () => object): T {
  Object.defineProperty(value, 'toJSON', { value: safe, enumerable: false });
  Object.defineProperty(value, inspectSymbol, { value: safe, enumerable: false });
  return value;
}

export function apiKeyCredentials(apiKey: string): ApiKeyCredentials {
  const credentials: ApiKeyCredentials = { type: AuthType.API_KEY, apiKey };
  return redact(credentials, () => ({ type: credentials.type, apiKey: REDACTED }));
}

export function oauthCredentials(
  tokens: Pick<OAuthCredentials, 'accessToken' | 'refreshToken' | 'expiresAt'>,
): OAuthCredentials {
  const credentials: OAuthCredentials = {
    type: AuthType.OAUTH,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  };
  return redact(credentials, () => ({
    type: credentials.type,
    accessToken: REDACTED,
    refreshToken: REDACTED,
    expiresAt: credentials.expiresAt,
  }));
}

// The header value for credentials. OAuth tokens are bearer tokens; an API key goes as it is, which
// is what Linear expects. Exported so a connect can validate a key before anything is stored.
export function toAuth(credentials: Credentials): Auth {
  const authorization =
    credentials.type === AuthType.API_KEY
      ? credentials.apiKey
      : `Bearer ${credentials.accessToken}`;
  return redact({ authorization }, () => ({ authorization: REDACTED }));
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
  // fields are picked by hand: JSON.stringify on the object itself would call the redacting toJSON
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

  // Synchronous on purpose: a connect calls it inside the same transaction that inserts the row.
  save(integrationId: IntegrationId, credentials: Credentials): void {
    const result = this.db
      .update(integrations)
      .set({ credentials: this.encrypt(credentials) })
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
    const current = this.read(integrationId);
    if (!this.needsRefresh(current.credentials)) return toAuth(current.credentials);

    return this.withLock(integrationId, async () => {
      // another caller may have refreshed while this one waited for the lock
      const latest = this.read(integrationId);
      if (!this.needsRefresh(latest.credentials)) return toAuth(latest.credentials);
      const { provider, blob, credentials } = latest;
      return toAuth(await this.refresh(integrationId, provider, blob, credentials));
    });
  }

  private read(integrationId: IntegrationId): {
    provider: Provider;
    blob: Buffer;
    credentials: Credentials;
  } {
    const row = this.db
      .select({ provider: integrations.provider, credentials: integrations.credentials })
      .from(integrations)
      .where(eq(integrations.id, integrationId))
      .get();
    if (!row) throw new NotFoundError(integrationId);
    return {
      provider: row.provider,
      blob: row.credentials,
      credentials: this.decrypt(integrationId, row.credentials),
    };
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
    const refreshed = oauthCredentials({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? credentials.refreshToken,
      expiresAt: tokens.expiresAt ?? null,
    });

    // Only replace the credentials this refresh started from. A save or clear that landed while the
    // request was out wins; this caller still gets its fresh token.
    this.db
      .update(integrations)
      .set({ credentials: this.encrypt(refreshed) })
      .where(and(eq(integrations.id, integrationId), eq(integrations.credentials, blob)))
      .run();
    return refreshed;
  }

  private encrypt(credentials: Credentials): Buffer {
    if (!this.cipher.isAvailable()) {
      throw new IntegrationAuthError(
        "Secure storage isn't available on this system, so DevBrain can't store credentials",
      );
    }
    return this.cipher.encrypt(serialize(credentials));
  }

  // Any failure becomes an IntegrationAuthError, so a corrupt or foreign blob asks for a reconnect
  // instead of crashing a sync. Parse errors are not attached as the cause: they can quote the input.
  private decrypt(integrationId: IntegrationId, blob: Buffer): Credentials {
    if (blob.length === 0) {
      throw new IntegrationAuthError(`No credentials are stored for ${integrationId}`);
    }

    let plain: string;
    try {
      plain = this.cipher.decrypt(blob);
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
    return stored.type === AuthType.API_KEY
      ? apiKeyCredentials(stored.apiKey)
      : oauthCredentials({
          accessToken: stored.accessToken,
          refreshToken: stored.refreshToken,
          expiresAt: stored.expiresAt === null ? null : new Date(stored.expiresAt),
        });
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
