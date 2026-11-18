import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  denyPermissions,
  hardenAllWebContents,
  hardenWebContents,
  type PermissionSession,
} from '../../runtime/hardening';

// Electron's session and web contents, as plain objects: hardening only sets handlers and listens.

function fakeSession() {
  const handlers = {} as {
    request: Parameters<PermissionSession['setPermissionRequestHandler']>[0];
    check: Parameters<PermissionSession['setPermissionCheckHandler']>[0];
    device: Parameters<PermissionSession['setDevicePermissionHandler']>[0];
  };
  const session: PermissionSession = {
    setPermissionRequestHandler: (handler) => (handlers.request = handler),
    setPermissionCheckHandler: (handler) => (handlers.check = handler),
    setDevicePermissionHandler: (handler) => (handlers.device = handler),
  };
  const request = (permission: string) => {
    let granted: boolean | undefined;
    handlers.request(null, permission, (value) => (granted = value));
    return granted;
  };
  return { session, handlers, request };
}

class FakeWebContents extends EventEmitter {
  url = 'file:///app/dist/renderer/index.html';
  windowOpenHandler: (() => { action: string }) | undefined;
  closeDevTools = vi.fn();
  setWindowOpenHandler(handler: () => { action: 'deny' }) {
    this.windowOpenHandler = handler;
  }
  getURL() {
    return this.url;
  }
  // what Electron sends: a preventable event, with the target URL for a navigation
  fire(name: string, url?: string) {
    const event = { url, preventDefault: vi.fn() };
    this.emit(name, event);
    return event.preventDefault.mock.calls.length > 0;
  }
}

describe('denyPermissions', () => {
  it('refuses every permission the page asks for but writing to the clipboard', () => {
    const { session, request } = fakeSession();
    denyPermissions(session);
    for (const permission of [
      'media',
      'notifications',
      'geolocation',
      'midi',
      'midiSysex',
      'pointerLock',
      'fullscreen',
      'openExternal',
      'display-capture',
      'clipboard-read',
      'hid',
      'serial',
      'usb',
      'idle-detection',
      'window-management',
    ]) {
      expect(request(permission), permission).toBe(false);
    }
    expect(request('clipboard-sanitized-write')).toBe(true);
  });

  it('answers checks the same way, and refuses devices', () => {
    const { session, handlers } = fakeSession();
    denyPermissions(session);
    expect(handlers.check(null, 'notifications', 'file://')).toBe(false);
    expect(handlers.check(null, 'media', 'file://')).toBe(false);
    expect(handlers.check(null, 'clipboard-sanitized-write', 'file://')).toBe(true);
    expect(handlers.device()).toBe(false);
  });
});

describe('hardenWebContents', () => {
  it('denies new windows', () => {
    const contents = new FakeWebContents();
    hardenWebContents(contents, { isPackaged: true });
    expect(contents.windowOpenHandler?.()).toEqual({ action: 'deny' });
  });

  it('cancels navigating or redirecting away from the page, and allows a reload', () => {
    const contents = new FakeWebContents();
    hardenWebContents(contents, { isPackaged: true });
    expect(contents.fire('will-navigate', 'https://evil.example/')).toBe(true);
    expect(contents.fire('will-navigate', 'file:///etc/passwd')).toBe(true);
    expect(contents.fire('will-redirect', 'https://evil.example/')).toBe(true);
    expect(contents.fire('will-navigate', contents.url)).toBe(false);
  });

  it('refuses to attach a webview', () => {
    const contents = new FakeWebContents();
    hardenWebContents(contents, { isPackaged: false });
    expect(contents.fire('will-attach-webview')).toBe(true);
  });

  it('closes devtools in a packaged app only', () => {
    const packaged = new FakeWebContents();
    hardenWebContents(packaged, { isPackaged: true });
    packaged.emit('devtools-opened');
    expect(packaged.closeDevTools).toHaveBeenCalled();

    const development = new FakeWebContents();
    hardenWebContents(development, { isPackaged: false });
    development.emit('devtools-opened');
    expect(development.closeDevTools).not.toHaveBeenCalled();
  });
});

describe('hardenAllWebContents', () => {
  it('hardens each web contents as the app creates it', () => {
    const app = new EventEmitter();
    hardenAllWebContents(app, { isPackaged: true });
    const contents = new FakeWebContents();
    app.emit('web-contents-created', {}, contents);
    expect(contents.windowOpenHandler?.()).toEqual({ action: 'deny' });
    expect(contents.fire('will-attach-webview')).toBe(true);
  });
});
