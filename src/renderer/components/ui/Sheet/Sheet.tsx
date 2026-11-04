import { createContext, useContext, type ComponentProps, type RefObject } from 'react';
import { Drawer } from '@base-ui/react/drawer';
import { cva, type VariantProps } from 'class-variance-authority';
import { Maximize2, X } from 'lucide-react';
import { cn, mergeClassName } from '../../lib/cn';
import { Button } from '../Button';
import styles from './Sheet.module.css';

export const sheetVariants = cva(styles.popup, {
  variants: {
    /**
     * `docked`: a full-height column on the right, beside the page (the default).
     * `overlay`: floats over the page with a backdrop, for compact windows.
     */
    variant: { docked: styles.docked, overlay: styles.overlay },
    /** 380px (`sheet-width`) for task and event details, 480px for an event's note */
    size: { default: undefined, wide: styles.sizeWide },
  },
  defaultVariants: { variant: 'docked', size: 'default' },
});

type SheetVariant = NonNullable<VariantProps<typeof sheetVariants>['variant']>;

const SheetVariantContext = createContext<SheetVariant>('docked');

export interface SheetProps extends Drawer.Root.Props {
  variant?: SheetVariant;
}

/**
 * The details panel for a task or an event. Docked, it doesn't trap focus or close on outside
 * clicks (the page beside it stays usable); as an `overlay` it is modal.
 * ```tsx
 * <Sheet open={open} onOpenChange={setOpen}>
 *   <SheetContent>
 *     <SheetHeader onOpenAsPage={openPage}>Task details</SheetHeader>
 *     <SheetBody>…</SheetBody>
 *   </SheetContent>
 * </Sheet>
 * ```
 */
export function Sheet({ variant = 'docked', ...props }: SheetProps) {
  const docked = variant === 'docked';
  return (
    <SheetVariantContext.Provider value={variant}>
      <Drawer.Root
        swipeDirection="right"
        modal={!docked}
        disablePointerDismissal={docked}
        {...props}
      />
    </SheetVariantContext.Provider>
  );
}

export const SheetTrigger = Drawer.Trigger;
export const SheetClose = Drawer.Close;

export interface SheetContentProps extends Drawer.Popup.Props {
  size?: VariantProps<typeof sheetVariants>['size'];
  /**
   * Portal into this element (a layout column that is `position: relative`) instead of the
   * window, so the page beside a docked sheet narrows rather than sitting under it.
   */
  container?: HTMLElement | RefObject<HTMLElement | null> | null;
}

export function SheetContent({ size, container, className, ...props }: SheetContentProps) {
  const variant = useContext(SheetVariantContext);
  return (
    <Drawer.Portal container={container}>
      {variant === 'overlay' && <Drawer.Backdrop className={styles.backdrop} />}
      <Drawer.Viewport className={styles.viewport} data-contained={container ? '' : undefined}>
        <Drawer.Popup
          className={mergeClassName(sheetVariants({ variant, size }), className)}
          {...props}
        />
      </Drawer.Viewport>
    </Drawer.Portal>
  );
}

export interface SheetHeaderProps extends Omit<ComponentProps<'div'>, 'title'> {
  /** shows the "open as page" button */
  onOpenAsPage?: () => void;
}

/** The panel name, then "open as page" and close icon buttons. Children are the title. */
export function SheetHeader({ onOpenAsPage, className, children, ...props }: SheetHeaderProps) {
  return (
    <div className={cn(styles.header, className)} {...props}>
      <SheetTitle>{children}</SheetTitle>
      {onOpenAsPage && (
        <Button
          variant="ghost"
          size="icon-xs"
          icon={Maximize2}
          aria-label="Open as page"
          onClick={onOpenAsPage}
        />
      )}
      <Drawer.Close render={<Button size="icon-xs" icon={X} aria-label="Close" />} />
    </div>
  );
}

export function SheetTitle({ className, ...props }: Drawer.Title.Props) {
  return <Drawer.Title className={mergeClassName(styles.title, className)} {...props} />;
}

export const SheetDescription = Drawer.Description;

/** The panel's content, 16px apart. */
export function SheetBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(styles.body, className)} {...props} />;
}
