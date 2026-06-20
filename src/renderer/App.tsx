import { useEffect, useState } from 'react';

export function App() {
  const [version, setVersion] = useState('…');
  const [pong, setPong] = useState('');

  useEffect(() => {
    window.api.getVersion().then(setVersion);
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Electron + Vite + React</h1>
      <div>This is cool</div>
      <p>App version: {version}</p>
      <button onClick={() => window.api.ping().then(setPong)}>Send ping</button>
      {pong && <p>Main replied: {pong}</p>}
    </main>
  );
}
