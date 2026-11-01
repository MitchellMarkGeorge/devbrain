import { useMutation, useQuery } from '@tanstack/react-query';
import { hexColorSchema } from '@common/color';
import type { WorkspaceEntry } from '@main/core';
import { trpc } from '../ipc';
import { useOpenFolder } from './useOpenFolder';
import styles from './WelcomeScreen.module.css';

// What the app shows while no workspace is open: the workspaces in the list to pick from, and
// "Open Existing Folder…" for a workspace folder brought from another computer (Figma: v2 Screens,
// "Welcome (existing workspaces)").
export function WelcomeScreen() {
  const workspaces = useQuery(trpc.workspaces.list.queryOptions({}));
  const open = useMutation(trpc.workspaces.open.mutationOptions());
  const folder = useOpenFolder();
  const items = workspaces.data?.items ?? [];
  const busy = open.isPending || folder.isPending;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Welcome to DevBrain</h1>
      <p className={styles.subtitle}>
        {items.length > 0
          ? 'Pick up where you left off, or open a workspace folder.'
          : 'Open a workspace folder to get started.'}
      </p>

      {items.length > 0 && (
        <section className={styles.card} aria-labelledby="recent-workspaces">
          <h2 id="recent-workspaces" className={styles.cardLabel}>
            Recent workspaces
          </h2>
          <ul className={styles.list}>
            {byLastOpened(items).map((workspace) => (
              <li key={workspace.id}>
                <button
                  type="button"
                  className={styles.row}
                  disabled={busy}
                  onClick={() => open.mutate({ id: workspace.id })}
                >
                  <WorkspaceTile name={workspace.name} color={workspace.color} />
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{workspace.name}</span>
                    <span className={styles.rowPath}>{workspace.path}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={() => void folder.openFolder()}
        >
          <FolderIcon />
          {folder.isPending ? 'Opening…' : 'Open Existing Folder…'}
        </button>
      </div>

      {(folder.error ?? open.error) && (
        <p role="alert" className={styles.error}>
          {folder.error ?? open.error?.message}
        </p>
      )}
    </main>
  );
}

function byLastOpened(items: WorkspaceEntry[]): WorkspaceEntry[] {
  return [...items].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
}

// The workspace's letter on a dark step of its colour (docs/design-system/components/
// WorkspaceTile.md). Stored colours are free hex strings, so one that fails to parse gets the
// neutral tile (docs/security/untrusted-content.md).
export function WorkspaceTile({ name, color }: { name: string; color: string }) {
  const valid = hexColorSchema.safeParse(color).success;
  const background = valid ? `color-mix(in oklab, ${color} 45%, black)` : undefined;
  return (
    <span className={styles.tile} style={{ background }} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

// Lucide "folder" at stroke 1.75
function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}
