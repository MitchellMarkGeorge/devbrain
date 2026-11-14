import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// Dialogs shown from anywhere: a component asks for one with `useModals().open(render)` instead
// of keeping its open state and rendering it where it is, or passing a callback up to whoever
// does. The root layout (app/Root.tsx) holds them, inside the router, the query client and
// the toasts, so a dialog can navigate, query and toast like any page.

/**
 * What a dialog shown with `open` gets: spread them onto `Dialog` or `AlertDialog`
 * (`<Dialog {...props}>`). `onOpenChange(false)` closes it; it is removed once its closing
 * animation has finished (`onOpenChangeComplete`).
 */
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete: (open: boolean) => void;
}

export interface Modals {
  /** Shows the dialog `render` returns, over the page. Returns the function that closes it. */
  open(render: (props: ModalProps) => ReactNode): () => void;
}

interface Modal {
  id: number;
  open: boolean;
  render: (props: ModalProps) => ReactNode;
}

const ModalsContext = createContext<Modals | null>(null);

let nextId = 0;

// closes one (it stays drawn while its closing animation runs), and removes it once that's done
const closing = (id: number) => (current: Modal[]) =>
  current.map((modal) => (modal.id === id ? { ...modal, open: false } : modal));
const removing = (id: number) => (current: Modal[]) => current.filter((modal) => modal.id !== id);

/**
 * Holds the dialogs shown with `useModals`, drawn after `children`, the last opened on top.
 * `closed` drops them all and shows none while it is true (a switch of workspace: the splash is
 * all the window shows).
 */
export function ModalProvider({
  closed = false,
  children,
}: {
  closed?: boolean;
  children: ReactNode;
}) {
  const [modals, setModals] = useState<Modal[]>([]);
  // dropped as the switch starts, in this render: none comes back after it
  if (closed && modals.length > 0) setModals([]);

  const open = useCallback((render: Modal['render']) => {
    const id = ++nextId;
    setModals((current) => [...current, { id, open: true, render }]);
    return () => setModals(closing(id));
  }, []);
  const modalsApi = useMemo(() => ({ open }), [open]);

  return (
    <ModalsContext.Provider value={modalsApi}>
      {children}
      {!closed &&
        modals.map((modal) => (
          <Fragment key={modal.id}>
            {modal.render({
              open: modal.open,
              onOpenChange: (isOpen) => {
                if (!isOpen) setModals(closing(modal.id));
              },
              onOpenChangeComplete: (isOpen) => {
                if (!isOpen) setModals(removing(modal.id));
              },
            })}
          </Fragment>
        ))}
    </ModalsContext.Provider>
  );
}

/** Shows dialogs over the page: `useModals().open((props) => <MyDialog {...props} />)`. */
export function useModals(): Modals {
  const modals = useContext(ModalsContext);
  if (modals === null) throw new Error('useModals needs a ModalProvider (the root layout has one)');
  return modals;
}
