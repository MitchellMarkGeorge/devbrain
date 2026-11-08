import { createContext } from 'react';

/**
 * Set by `WorkspaceShell` while the header is drawn inside the window bar (the sidebar is hidden). In a
 * module of its own, so editing PageHeader.tsx never re-creates it: a fresh context would leave
 * the shell's provider on the old one, and the header drawn as if outside the bar.
 */
export const PageHeaderInWindowBar = createContext(false);
