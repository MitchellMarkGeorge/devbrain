// What the main process does to keep every web page it creates to the app's own page
// (docs/security/hardening.md). Electron's objects are passed in, typed down to what is used, so
// tests can drive them with plain emitters.

/** The permissions DevBrain's page may use: copying to the clipboard (navigator.clipboard). */
export const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write']);

export const isAllowedPermission = (permission: string): boolean =>
  ALLOWED_PERMISSIONS.has(permission);

export interface PermissionSession {
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
    ) => void,
  ): void;
  setPermissionCheckHandler(
    handler: (webContents: unknown, permission: string, requestingOrigin: string) => boolean,
  ): void;
  setDevicePermissionHandler(handler: () => boolean): void;
}

/**
 * Refuses every permission the page asks for (camera, microphone, notifications, geolocation,
 * MIDI, HID, USB, serial, …) but writing to the clipboard. Electron grants them all when no
 * handler is set. Both the request (a prompt in a browser) and the check (a query, such as
 * navigator.permissions) are answered, and device access (WebHID, WebUSB, Web Serial) too.
 */
export function denyPermissions(session: PermissionSession): void {
  session.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(isAllowedPermission(permission)),
  );
  session.setPermissionCheckHandler((_contents, permission) => isAllowedPermission(permission));
  session.setDevicePermissionHandler(() => false);
}

interface PreventableEvent {
  preventDefault(): void;
}

export interface HardenedWebContents {
  setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  getURL(): string;
  on(
    event: 'will-navigate',
    listener: (event: PreventableEvent & { url: string }) => void,
  ): unknown;
  on(
    event: 'will-redirect',
    listener: (event: PreventableEvent & { url: string }) => void,
  ): unknown;
  on(event: 'will-attach-webview', listener: (event: PreventableEvent) => void): unknown;
  on(event: 'devtools-opened', listener: () => void): unknown;
  closeDevTools(): void;
}

/**
 * Keeps a web page to the app's page (docs/security/untrusted-content.md): a link that escapes
 * the renderer's rules can't open a window, load another page in it, or attach a <webview>. Links
 * open in the browser through workspace.openUrl only. The app routes within its page, which is no
 * navigation; reloading it (as Vite does in development) is the one navigation allowed. In a
 * packaged app, devtools are off (webPreferences.devTools) and closed if anything opens them.
 */
export function hardenWebContents(
  contents: HardenedWebContents,
  { isPackaged }: { isPackaged: boolean },
): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const stayOnPage = (event: PreventableEvent & { url: string }) => {
    if (event.url !== contents.getURL()) event.preventDefault();
  };
  contents.on('will-navigate', stayOnPage);
  contents.on('will-redirect', stayOnPage);
  contents.on('will-attach-webview', (event) => event.preventDefault());
  if (isPackaged) contents.on('devtools-opened', () => contents.closeDevTools());
}

export interface HardenedApp {
  on(
    event: 'web-contents-created',
    listener: (event: unknown, contents: HardenedWebContents) => void,
  ): unknown;
}

/**
 * Hardens every web contents the app creates, as it is created: the window's page, and anything
 * else that appears (a devtools window in development, a <webview> refused at attach anyway).
 */
export function hardenAllWebContents(app: HardenedApp, options: { isPackaged: boolean }): void {
  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents, options));
}
