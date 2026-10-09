import { describe, it, expect, afterEach } from 'vitest';
import {
  LoopbackListener,
  OAuthCallbackTimeoutError,
  startLoopback,
} from '../../../integrations/oauth/loopback';
import { IntegrationAuthError } from '../../../shared/errors';
import { freePorts, isListening, occupyPort, portOf } from './fake-auth-server';

const STATE = 'state-123';

describe('OAuth — loopback listener', () => {
  const opened: LoopbackListener[] = [];

  async function start(overrides: Partial<Parameters<typeof startLoopback>[0]> = {}) {
    const listener = await startLoopback({
      ports: 'any',
      path: '/callback',
      state: STATE,
      signal: new AbortController().signal,
      ...overrides,
    });
    opened.push(listener);
    return listener;
  }

  function callback(listener: LoopbackListener, query: string) {
    return fetch(`${listener.redirectUri}?${query}`);
  }

  afterEach(() => {
    for (const listener of opened.splice(0)) listener.close();
  });

  it('binds 127.0.0.1 and returns the exact redirect URI', async () => {
    const listener = await start();
    expect(listener.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(await isListening(portOf(listener.redirectUri))).toBe(true);
  });

  it('accepts the callback, serves the close-this-tab page and closes', async () => {
    const listener = await start();
    const response = await callback(listener, `code=the-code&state=${STATE}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('You can close this tab');
    expect(await listener.code).toBe('the-code');
    expect(await isListening(portOf(listener.redirectUri))).toBe(false);
  });

  it('turns away a wrong or missing state and keeps waiting for the real callback', async () => {
    const listener = await start();
    expect((await callback(listener, 'code=forged&state=wrong')).status).toBe(400);
    expect((await callback(listener, 'code=forged')).status).toBe(400);
    expect(await isListening(portOf(listener.redirectUri))).toBe(true);

    await callback(listener, `code=real&state=${STATE}`);
    expect(await listener.code).toBe('real');
  });

  it('answers 404 to any other path or method, and keeps waiting', async () => {
    const listener = await start();
    const origin = new URL(listener.redirectUri).origin;
    expect((await fetch(`${origin}/favicon.ico`)).status).toBe(404);
    expect((await fetch(`${origin}/callback/extra?state=${STATE}`)).status).toBe(404);
    expect((await fetch(listener.redirectUri, { method: 'POST' })).status).toBe(404);
    expect(await isListening(portOf(listener.redirectUri))).toBe(true);
  });

  it('ignores a second request: the listener is gone once the code arrived', async () => {
    const listener = await start();
    await callback(listener, `code=first&state=${STATE}`);
    await expect(callback(listener, `code=second&state=${STATE}`)).rejects.toThrow();
    expect(await listener.code).toBe('first');
  });

  it('rejects with IntegrationAuthError when the provider reports an error, and closes', async () => {
    const listener = await start();
    const response = await callback(listener, `error=access_denied&state=${STATE}`);
    expect(await response.text()).toContain('Sign-in not completed');
    await expect(listener.code).rejects.toThrow(IntegrationAuthError);
    await expect(listener.code).rejects.toThrow('access_denied');
    expect(await isListening(portOf(listener.redirectUri))).toBe(false);
  });

  it('times out and closes when no callback arrives', async () => {
    const listener = await start({ timeoutMs: 50 });
    await expect(listener.code).rejects.toThrow(OAuthCallbackTimeoutError);
    expect(await isListening(portOf(listener.redirectUri))).toBe(false);
  });

  it('stops on abort and closes', async () => {
    const controller = new AbortController();
    const listener = await start({ signal: controller.signal });
    controller.abort();
    await expect(listener.code).rejects.toThrow(expect.objectContaining({ name: 'AbortError' }));
    expect(await isListening(portOf(listener.redirectUri))).toBe(false);
  });

  it('does not start when the signal is already aborted', async () => {
    const [port] = await freePorts(1);
    const controller = new AbortController();
    controller.abort();
    await expect(start({ ports: [port], signal: controller.signal })).rejects.toThrow(
      expect.objectContaining({ name: 'AbortError' }),
    );
    expect(await isListening(port)).toBe(false);
  });

  it('closes on request, and closing twice is harmless', async () => {
    const listener = await start();
    listener.close();
    listener.close();
    expect(await isListening(portOf(listener.redirectUri))).toBe(false);
  });

  it('falls through to the next fixed port when the first is busy', async () => {
    const busy = await occupyPort();
    try {
      const [free] = await freePorts(1);
      const listener = await start({ ports: [busy.port, free] });
      expect(listener.redirectUri).toBe(`http://127.0.0.1:${free}/callback`);
      await callback(listener, `code=c&state=${STATE}`);
      expect(await listener.code).toBe('c');
    } finally {
      await busy.close();
    }
  });

  it('fails when every fixed port is busy', async () => {
    const busy = await occupyPort();
    try {
      await expect(start({ ports: [busy.port] })).rejects.toThrow('None of the redirect ports');
    } finally {
      await busy.close();
    }
  });
});
