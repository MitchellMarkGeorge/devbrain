import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import log from 'electron-log/renderer';
import { WindowFrameProvider, detectPlatform, type WindowFrame } from './components/lib/platform';
import { events, ipc, queryInvalidator, queryClient, trpc } from './ipc';
import { readInitialLoadContext, seedQueryCache } from './ipc/initial-load-context';
import type { Services } from './app/context';
import { createWindowRouters, placeRouters } from './app/routers';
import { WindowContent } from './app/WindowContent';
import { createWorkspaceStateStore, type WorkspaceStateStore } from './app/workspace-state';
import { applyThemeSetting } from './theme';
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

const services: Services = { queryClient, trpc, ipc, events, initialLoadContext };

// the app's router (hash history) and onboarding's (memory history), made once
const routers = createWindowRouters(services);

// what the window shows: the splash, onboarding or the app, as main says from now on; listening
// before the first render, then asking main once for anything sent before it listened. Each state
// puts its router where it should start before it renders.
const workspaceState: WorkspaceStateStore = createWorkspaceStateStore({
  initial: initialLoadContext?.workspace ?? null,
  events,
  fetch:
    initialLoadContext?.devBrainAvailable === false
      ? undefined
      : () => ipc.workspaces.state.query(),
  onShow: (shown) =>
    placeRouters(routers, shown, queryClient.getQueryData(trpc.settings.get.queryKey())),
});

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

function App() {
  // apply the theme every time the theme changes
  const settings = useQuery(trpc.settings.get.queryOptions(), queryClient);

  const theme = settings.data?.theme;

  useEffect(() => {
    if (theme) applyThemeSetting(theme);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <WindowFrameProvider value={windowFrame}>
        <WindowContent services={services} workspaceState={workspaceState} routers={routers} />
      </WindowFrameProvider>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
