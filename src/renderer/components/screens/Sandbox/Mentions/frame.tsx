/*
 * The window around the Sandbox mentions stories, in today's chrome: `ScreenFrame`'s
 * `WorkspaceShell`, the page's title and actions in the title bar, and sheets docked in the
 * shell's sheet column.
 */
import type { ReactNode } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { DropdownMenuItem, DropdownMenuSeparator } from '../../../ui/DropdownMenu';
import { EditorTitle } from '../../../editor/EditorContent';
import { PageContent, PageFavoriteButton, PageMenuButton } from '../../../shell/Page';
import { Sheet, SheetBody, SheetContent } from '../../../ui/Sheet';
import { useWorkspaceShell } from '../../../shell/WorkspaceShell';
import { ScreenFrame, type PageName } from '../../Shell/AppFrame';

/** A detail page's actions: the star and the "…" menu, at the title bar's end. */
export const DETAIL_ACTIONS = (
  <>
    <PageFavoriteButton favorite={false} />
    <PageMenuButton>
      <DropdownMenuItem icon={<Copy />}>Copy as Markdown</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={<Trash2 />} variant="destructive">
        Move to Trash
      </DropdownMenuItem>
    </PageMenuButton>
  </>
);

/**
 * A detail page (a task, a note) in the shell: its title in the title bar's search field, the
 * star and "…" at its end, and the content in the 720px document column. `aside` sits in the page
 * beside the column.
 */
export function DetailScreen({
  page,
  title,
  aside,
  children,
}: {
  page: PageName;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const content = <PageContent layout="document">{children}</PageContent>;
  return (
    <ScreenFrame page={page} title={title} actions={DETAIL_ACTIONS}>
      {aside ? (
        <div style={{ display: 'flex', minHeight: '100%' }}>
          <div style={{ flex: 1, minWidth: 0 }}>{content}</div>
          {aside}
        </div>
      ) : (
        content
      )}
    </ScreenFrame>
  );
}

/** A note's top as the note page draws it: the title, when it was edited, then its pills. */
export function NoteHead({ title, pills }: { title: string; pills: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <EditorTitle>{title}</EditorTitle>
      <span
        style={{
          marginTop: 2,
          color: 'var(--subtle-foreground)',
          fontSize: 12,
          lineHeight: '16px',
        }}
      >
        Edited yesterday
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>{pills}</div>
    </div>
  );
}

/**
 * A sheet docked in the shell's column at the right, as the app's task, note and event sheets
 * are. Render it inside the `ScreenFrame`: it waits for the column.
 */
export function DockedSheet({
  open = true,
  onOpenChange,
  header,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  header: ReactNode;
  children: ReactNode;
}) {
  const { sheetContainer } = useWorkspaceShell();
  if (!sheetContainer) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent container={sheetContainer}>
        {header}
        <SheetBody>{children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}
