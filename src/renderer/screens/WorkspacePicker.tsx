import type { WorkspaceEntry } from '@main/core';
import { button, card, errorText, page, swatch } from './styles';

interface WorkspacePickerProps {
  workspaces: WorkspaceEntry[];
  error: string | null;
  onOpen: (workspace: WorkspaceEntry) => void;
  onNew: () => void;
}

// Shown when no workspace is open and there are some to open.
export function WorkspacePicker({ workspaces, error, onOpen, onNew }: WorkspacePickerProps) {
  return (
    <main style={page}>
      <div style={card}>
        <h1 style={{ margin: 0 }}>Open a workspace</h1>
        {error && <p style={errorText}>Couldn&apos;t open the workspace: {error}</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <button
                type="button"
                style={{
                  ...button,
                  width: '100%',
                  display: 'flex',
                  gap: '0.6rem',
                  alignItems: 'center',
                }}
                onClick={() => onOpen(workspace)}
              >
                <span style={swatch(workspace.color)} />
                {workspace.name}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" style={button} onClick={onNew}>
          New workspace
        </button>
      </div>
    </main>
  );
}
