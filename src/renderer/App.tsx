import { useQuery } from '@tanstack/react-query';
import { trpc } from './ipc';

export function App() {
  const version = useQuery(trpc.app.version.queryOptions());
  const workspace = useQuery(trpc.workspaces.current.queryOptions());
  // runs only when asked
  const ping = useQuery({ ...trpc.app.ping.queryOptions(), enabled: false });

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Electron + Vite + React</h1>
      <div>This is cool</div>
      <p>App version: {version.data ?? '…'}</p>
      <p>Workspace: {workspace.data?.name ?? 'none open'}</p>
      <button onClick={() => void ping.refetch()}>Send ping</button>
      {ping.data && <p>Main replied: {ping.data}</p>}
    </main>
  );
}
