import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createHashHistory, RouterProvider } from '@tanstack/react-router';
import log from 'electron-log/renderer';
import { WindowFrameProvider, detectPlatform, type WindowFrame } from './components/lib/platform';
import { events, ipc, queryInvalidator, queryClient, trpc } from './ipc';
import { readInitialLoadContext, seedQueryCache } from './ipc/initial-load-context';
import { FollowThemeSetting, applyThemeSetting } from './theme';
import { createAppRouter, SPLASH_MINIMUM_MS } from './router';
import { WorkspaceSession } from './session/workspace-session';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';

// this might have to be done in the App component so the stopCatching() method can be called
log.errorHandler.startCatching();

// refetch what main says changed outside any call: sync, and a switch of workspace
queryInvalidator.listen(events);

// what main holds now, so the first render shows the right screen with its data, in its theme
const initialLoadContext = readInitialLoadContext();
seedQueryCache(queryClient, initialLoadContext);
applyThemeSetting(initialLoadContext?.theme ?? 'system');

// The one router, made once: its location in the URL's hash, where main reads the last page
// (src/main/runtime/last-page.ts). The session follows the workspace lifecycle and makes the
// navigations it calls for: it reopens the last workspace now, or, on a reload, loads the page in
// the URL.
const session = new WorkspaceSession({
  events,
  ipc,
  trpc,
  queryClient,
  queryInvalidator,
  initial: initialLoadContext,
  onError: (error) => log.error('Following the open workspace failed', error),
});
// with no DevBrain the root shows why and nothing else, so nothing opens
const devBrainAvailable = initialLoadContext?.devBrainAvailable ?? true;
const router = createAppRouter(createHashHistory(), {
  queryClient,
  trpc,
  ipc,
  session,
  devBrainAvailable,
  splashMinimumMs: SPLASH_MINIMUM_MS,
});
if (devBrainAvailable) session.start(router);

// The window around the page: the platform from the preload, the system's own window controls,
// and the Windows title bar's menu button popping up the app menu (src/main/runtime/window-chrome.ts)
const windowFrame: WindowFrame = {
  platform: detectPlatform(),
  controls: 'system',
  onOpenAppMenu: (at) => {
    ipc.app.showMenu
      .mutate(at)
      .catch((error: unknown) => log.error('Showing the app menu failed', error));
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <WindowFrameProvider value={windowFrame}>
        <FollowThemeSetting />
        <RouterProvider router={router} />
      </WindowFrameProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
