import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import log from 'electron-log/renderer';
import { events, queryInvalidator, queryClient, trpc } from './ipc';
import { readBootSnapshot, seedBootSnapshot } from './ipc/boot';
import './styles/tokens.css';
import './styles/base.css';

// this might have to be done in the App component so the stopCatching() method can be called
log.errorHandler.startCatching();

// refetch what main says changed outside any call: sync, and a switch of workspace
queryInvalidator.listen(events);

// Main may already hold an open workspace on reload. Seed that state before React's first frame.
seedBootSnapshot(readBootSnapshot(), queryClient, trpc);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
