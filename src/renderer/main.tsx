import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import log from 'electron-log/renderer';

// this might have to be done in the App component so the stopCatching() method can be called
log.errorHandler.startCatching();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
