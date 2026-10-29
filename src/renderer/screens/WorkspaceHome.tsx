import { useQuery } from '@tanstack/react-query';
import type { WorkspaceEntry } from '@main/core';
import { trpc } from '../ipc';
import { button, swatch } from './styles';

interface WorkspaceHomeProps {
  workspace: WorkspaceEntry;
  workspaces: WorkspaceEntry[];
  onSwitch: (workspace: WorkspaceEntry) => void;
}

// The open workspace. A placeholder for the app's real views, with the workspace switcher.
export function WorkspaceHome({ workspace, workspaces, onSwitch }: WorkspaceHomeProps) {
  const version = useQuery(trpc.app.version.queryOptions());
  const others = workspaces.filter(({ id }) => id !== workspace.id);

  return (
    <main style={{ padding: '2rem', display: 'grid', gap: '1rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={swatch(workspace.color, 14)} />
        <h1 style={{ margin: 0 }}>{workspace.name}</h1>
      </header>
      {others.length > 0 && (
        <section style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          Switch to
          {others.map((other) => (
            <button key={other.id} type="button" style={button} onClick={() => onSwitch(other)}>
              <span style={{ ...swatch(other.color), marginRight: 6 }} />
              {other.name}
            </button>
          ))}
        </section>
      )}
      <p style={{ margin: 0, color: 'var(--muted)' }}>DevBrain {version.data ?? '…'}</p>
    </main>
  );
}
