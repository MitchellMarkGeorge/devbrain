import type { SplashWorkspace } from '../startup';
import { page, swatch } from './styles';

// Shown while a workspace opens: at startup, after picking or creating one, and while switching.
export function SplashScreen({ workspace }: { workspace: SplashWorkspace | null }) {
  return (
    <main style={page} aria-busy="true">
      <h1 style={{ margin: 0, fontWeight: 600 }}>DevBrain</h1>
      {workspace && (
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={swatch(workspace.color)} />
          Opening {workspace.name}…
        </p>
      )}
    </main>
  );
}
