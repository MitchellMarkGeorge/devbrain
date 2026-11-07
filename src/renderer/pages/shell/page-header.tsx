import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from '@tanstack/react-router';
import { Breadcrumb, PageHeader } from '../../components';

// AppShell takes the page's header as a prop, but the page under the layout decides it: its
// breadcrumb, and its actions (favorite, the ⋯ menu). The layout passes an empty slot as the header,
// and each page renders its PageHeader into it.

const SlotContext = createContext<HTMLElement | null>(null);

/** The layout's side: the element to pass as AppShell's header, and the slot it makes. */
export function usePageHeaderSlot(): { header: ReactNode; slot: HTMLElement | null } {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return { header: <div ref={setSlot} style={{ display: 'contents' }} />, slot };
}

export const PageHeaderSlotProvider = SlotContext.Provider;

/** A page's side: renders its header into the shell's. */
export function PageHeaderPortal({ children }: { children: ReactNode }) {
  const slot = useContext(SlotContext);
  return slot ? createPortal(children, slot) : null;
}

/**
 * The header of a page named in the breadcrumb under the open workspace ("Work › Tasks"), with its
 * actions; with no `title`, an empty header (Home has no title bar content of its own).
 */
export function PageTitle({ title, actions }: { title?: string; actions?: ReactNode }) {
  const { session } = useRouter().options.context;
  const workspace = useSyncExternalStore(session.subscribe, () => session.getState().workspace);
  return (
    <PageHeaderPortal>
      {title ? (
        <PageHeader actions={actions}>
          <Breadcrumb items={[workspace?.name ?? 'DevBrain', title]} />
        </PageHeader>
      ) : (
        <PageHeader actions={actions} />
      )}
    </PageHeaderPortal>
  );
}
