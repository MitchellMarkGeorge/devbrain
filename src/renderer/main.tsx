import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { App } from './App';
import log from 'electron-log/renderer';
import { listenForChanges } from './data/changes';
import { queryClient } from './data/queryClient';
import { events } from './ipc';

// this might have to be done in the App component so the stopCatching() method can be called
log.errorHandler.startCatching();

// once, for the page's life: outside React, so StrictMode's double effects can't subscribe twice
listenForChanges(events);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {import.meta.env.DEV && <ReactQueryDevtools />}
    </QueryClientProvider>
  </React.StrictMode>,
);
