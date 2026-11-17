import { ExternalSourceId } from '@common/ids';
import type { Auth } from '../integrations/auth';
import type { Provider as ProviderImpl } from '../integrations/providers/provider';
import type { IntegrationService } from '../integrations/service';
import { IntegrationAuthError } from '../shared/errors';
import { SyncStateManager, SyncTarget, syncSkipReason } from './sync-state';
import { SyncSkipReason } from './types';

// What SourceAccess needs from IntegrationService, the one owner of the provider registry and the
// credential store: the provider an integration connected through, fresh auth for it, and
// needs_reauth when the provider rejects it
export type ProviderConnections = Pick<
  IntegrationService,
  'getProvider' | 'getAuth' | 'markNeedsReauth'
>;

export interface SourceAccessOptions {
  integrations: ProviderConnections;
  syncState: Pick<SyncStateManager, 'getSyncTarget'>;
  now?: () => Date; // injected for tests
}

// a source that may be asked now, with the provider its integration connected through
export interface OpenSource {
  target: SyncTarget;
  provider: ProviderImpl;
}

// what a call outside a run is given
export interface SourceCall<S> extends OpenSource {
  // the provider's part the call needs, e.g. its TaskSource
  source: S;
  auth: Auth;
}

export type SourceCallResult<T> = { ok: true; value: T } | { ok: false; reason: SyncSkipReason };

/**
 * The one way sync's code reaches a provider for a source, so every entry point follows the same
 * rules: a sync run (SyncEngine), a reattach (TaskReconciler.reattachGroups), a fetch of older
 * calendar history (EventFetcher) and a refresh of the calendar list (EventSyncer).
 *
 * - `open` is the gate: nothing may ask the provider while the source or its integration is off,
 *   the integration needs re-authentication or the provider's retry time has not passed
 *   (syncSkipReason), and a source whose provider is not registered is unsupported.
 * - `call` is the whole path for a call outside a run: open, pick the provider's part the call
 *   needs, get auth, run it. Rejected credentials (IntegrationAuthError from auth or the call) move
 *   the integration to needs_reauth, as a run's do, and are rethrown. A run records its failure on
 *   its source first, so the engine marks needs_reauth itself (SyncEngine.recordFailure).
 *
 * The provider comes from IntegrationService, so an integration always syncs through the provider
 * that connected it.
 */
export class SourceAccess {
  private readonly integrations: ProviderConnections;
  private readonly syncState: Pick<SyncStateManager, 'getSyncTarget'>;
  private readonly now: () => Date;

  constructor(options: SourceAccessOptions) {
    this.integrations = options.integrations;
    this.syncState = options.syncState;
    this.now = options.now ?? (() => new Date());
  }

  /** The source and its provider, or why nothing may ask the provider for it now. Reads only. */
  open(sourceId: ExternalSourceId): OpenSource | SyncSkipReason {
    const target = this.syncState.getSyncTarget(sourceId);
    const blocked = syncSkipReason(target, this.now());
    if (blocked) return blocked;
    const provider = this.integrations.getProvider(target.provider);
    if (!provider) return SyncSkipReason.UNSUPPORTED;
    return { target, provider };
  }

  /** Fresh auth for the source's integration; `signal` stops the wait, see CredentialStore.getAuth */
  getAuth(target: SyncTarget, signal?: AbortSignal): Promise<Auth> {
    return this.integrations.getAuth(target.integrationId, { signal });
  }

  /**
   * Runs `call` for the source with fresh auth, when the gate lets it and the provider has the part
   * `pick` asks for (unsupported otherwise). Rejected credentials mark the integration
   * needs_reauth, then are rethrown; any other failure is rethrown as it is.
   */
  async call<S, T>(
    sourceId: ExternalSourceId,
    pick: (provider: ProviderImpl, target: SyncTarget) => S | undefined,
    call: (context: SourceCall<S>) => Promise<T>,
    options: { signal?: AbortSignal } = {},
  ): Promise<SourceCallResult<T>> {
    const open = this.open(sourceId);
    if (typeof open === 'string') return { ok: false, reason: open };
    const source = pick(open.provider, open.target);
    if (source === undefined) return { ok: false, reason: SyncSkipReason.UNSUPPORTED };
    try {
      const auth = await this.getAuth(open.target, options.signal);
      return { ok: true, value: await call({ ...open, source, auth }) };
    } catch (error) {
      // only a reconnect fixes rejected credentials
      if (error instanceof IntegrationAuthError) {
        this.integrations.markNeedsReauth(open.target.integrationId);
      }
      throw error;
    }
  }
}
