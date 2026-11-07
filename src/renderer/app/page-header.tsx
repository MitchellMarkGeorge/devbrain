import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// `AppShell` takes the page's header as a prop, but the route below the layout decides it. The
// layout passes an empty slot as the header, and each page renders its `PageHeader` into it.

const SlotContext = createContext<HTMLElement | null>(null);

/** The layout's side: the element to pass as `AppShell`'s header, and the slot it fills. */
export function usePageHeaderSlot(): { header: ReactNode; slot: HTMLElement | null } {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return { header: <div ref={setSlot} style={{ display: 'contents' }} />, slot };
}

export const PageHeaderSlotProvider = SlotContext.Provider;

/** A page's side: renders its `PageHeader` in the shell's header. */
export function PageHeaderPortal({ children }: { children: ReactNode }) {
  const slot = useContext(SlotContext);
  return slot ? createPortal(children, slot) : null;
}
