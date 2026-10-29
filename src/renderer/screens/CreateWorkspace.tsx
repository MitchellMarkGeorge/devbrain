import { useState, type FormEvent } from 'react';
import { button, card, errorText, page, swatch } from './styles';

// the colours offered for a new workspace
export const WORKSPACE_COLORS = ['#4f7cff', '#22a06b', '#e5a00d', '#e5484d', '#8e4ec6', '#6b7280'];

interface CreateWorkspaceProps {
  error: string | null;
  // null when there are no workspaces to go back to
  onCancel: (() => void) | null;
  onCreate: (input: { name: string; color: string }) => void;
}

// Shown when there are no workspaces yet, or when the user asks for a new one from the picker.
export function CreateWorkspace({ error, onCancel, onCreate }: CreateWorkspaceProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(WORKSPACE_COLORS[0]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === '') return;
    onCreate({ name: name.trim(), color });
  }

  return (
    <main style={page}>
      <form style={card} onSubmit={submit}>
        <h1 style={{ margin: 0 }}>Create a workspace</h1>
        {error && <p style={errorText}>Couldn&apos;t create the workspace: {error}</p>}
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          Name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={{ ...button, cursor: 'text' }}
          />
        </label>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: '0.5rem' }}>
          <legend style={{ marginBottom: '0.35rem' }}>Colour</legend>
          {WORKSPACE_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={option}
              aria-pressed={option === color}
              onClick={() => setColor(option)}
              style={{
                ...button,
                padding: 6,
                borderColor: option === color ? 'var(--text)' : 'var(--border)',
              }}
            >
              <span style={swatch(option, 16)} />
            </button>
          ))}
        </fieldset>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" style={button} disabled={name.trim() === ''}>
            Create
          </button>
          {onCancel && (
            <button type="button" style={button} onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
