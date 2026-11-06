import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import log from 'electron-log/renderer';
import { WindowFrameProvider, detectPlatform, type WindowFrame } from './components/lib/platform';
import { events, ipc, queryInvalidator, queryClient, trpc } from './ipc';
import { readInitialLoadContext, seedQueryCache } from './ipc/initial-load-context';
import { createAppRouter } from './router';
import { FollowThemeSetting, applyThemeSetting } from './theme';
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
applyThemeSetting(initialLoadContext?.settings?.theme ?? 'system');

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

const router = createAppRouter({ queryClient, trpc, ipc, events, initialLoadContext });

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
