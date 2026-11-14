import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createHashHistory } from '@tanstack/react-router';
import log from 'electron-log/renderer';
import {
  WindowFrameProvider,
  detectPlatform,
  type WindowFrame,
} from '@renderer/components/lib/platform';
import { events, ipc, queryInvalidator, queryClient, trpc } from '@renderer/ipc';
import { readInitialLoadContext, seedQueryCache } from '@renderer/ipc/initial-load-context';
import { applyThemeSetting } from '@renderer/app/theme';
import { createAppRouter, followOutsideChanges } from '@renderer/app/router';
import { AppWindow } from '@renderer/app/AppWindow';
import '@renderer/styles/fonts.css';
import '@renderer/styles/tokens.css';
import '@renderer/styles/base.css';

// this might have to be done in the App component so the stopCatching() method can be called
log.errorHandler.startCatching();

// refetch what main says changed outside any call: sync, and a switch of workspace
queryInvalidator.listen(events);

// what main holds now, so the first render shows the right screen with its data, in its theme
const initialLoadContext = readInitialLoadContext();
seedQueryCache(queryClient, initialLoadContext);
applyThemeSetting(initialLoadContext?.settings?.theme ?? 'system');

// The app's one router, never made again. Hash history: the page loads from file://, and main
// reads the window's page from the URL's hash (src/main/runtime/last-page.ts)
const router = createAppRouter({
  history: createHashHistory(),
  context: { queryClient, trpc, ipc },
});
// a delete, a close or an open elsewhere moves the window to onboarding or that workspace
followOutsideChanges(router, events);

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
        <AppWindow
          router={router}
          devBrainAvailable={initialLoadContext?.devBrainAvailable ?? true}
        />
      </WindowFrameProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
