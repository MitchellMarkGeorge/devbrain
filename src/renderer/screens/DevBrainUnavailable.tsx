import { page } from './styles';

// DevBrain could not be loaded (src/main/index.ts loadCore returned null): nothing can run.
export function DevBrainUnavailable() {
  return (
    <main style={page}>
      <h1 style={{ margin: 0 }}>DevBrain couldn&apos;t start</h1>
      <p style={{ margin: 0, maxWidth: 480, textAlign: 'center' }}>
        Its folder is missing or invalid. In development, run <code>npm run seed:dev</code> to
        create one; the log has the details.
      </p>
    </main>
  );
}
