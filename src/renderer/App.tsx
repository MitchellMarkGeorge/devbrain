import { useEffect, useState } from 'react';
import { ipc } from './ipc';

export function App() {
  const [version, setVersion] = useState('…');
  const [pong, setPong] = useState('');

  useEffect(() => {
    ipc.app.version.query().then(setVersion);
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Electron + Vite + React</h1>
      <div>This is cool</div>
      <p>App version: {version}</p>
      <button onClick={() => ipc.app.ping.query().then(setPong)}>Send ping</button>
      {pong && <p>Main replied: {pong}</p>}
    </main>
  );
}
