import type { ComponentProps } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn, mergeClassName } from '../../lib/cn';
import { IconButton } from '../IconButton';
import styles from './Dialog.module.css';

export const dialogVariants = cva(styles.popup, {
  variants: {
    /** 384px, or 480px for forms (create task, create event) */
    size: { default: styles.sizeDefault, form: styles.sizeForm },
  },
  defaultVariants: { size: 'default' },
});

// ---------- Dialog ----------

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export interface DialogContentProps
  extends BaseDialog.Popup.Props, VariantProps<typeof dialogVariants> {
  /** the × in the corner; on by default */
  showClose?: boolean;
}

/**
 * The dialog over a black/50 backdrop.
 * ```tsx
 * <Dialog>
 *   <DialogTrigger render={<Button />}>New Task</DialogTrigger>
 *   <DialogContent size="form">
 *     <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
 *     …fields…
 *     <DialogFooter>
 *       <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
 *       <Button>Create Task</Button>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 */
export function DialogContent({
  size,
  showClose = true,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={styles.backdrop} />
      <BaseDialog.Popup className={mergeClassName(dialogVariants({ size }), className)} {...props}>
        {children}
        {showClose && (
          <BaseDialog.Close
            className={styles.close}
            render={<IconButton size="xs" icon={X} label="Close" tooltip={false} />}
          />
        )}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export function DialogTitle({ className, ...props }: BaseDialog.Title.Props) {
  return <BaseDialog.Title className={mergeClassName(styles.title, className)} {...props} />;
}

export function DialogDescription({ className, ...props }: BaseDialog.Description.Props) {
  return (
    <BaseDialog.Description className={mergeClassName(styles.description, className)} {...props} />
  );
}

/** The title over the description, 6px apart. */
export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(styles.header, className)} {...props} />;
}

/**
 * The actions, bottom right in Nova's footer band: a `ghost` Cancel, then the `default` or
 * `destructive` action. Never `primary`.
 */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(styles.footer, className)} {...props} />;
}

// ---------- AlertDialog ----------

/** A confirmation of an irreversible action: no ×, and it only closes through its buttons. */
export const AlertDialog = BaseAlertDialog.Root;
export const AlertDialogTrigger = BaseAlertDialog.Trigger;
export const AlertDialogClose = BaseAlertDialog.Close;
export const AlertDialogHeader = DialogHeader;
export const AlertDialogFooter = DialogFooter;

export type AlertDialogContentProps = BaseAlertDialog.Popup.Props &
  VariantProps<typeof dialogVariants>;

export function AlertDialogContent({ size, className, ...props }: AlertDialogContentProps) {
  return (
    <BaseAlertDialog.Portal>
      <BaseAlertDialog.Backdrop className={styles.backdrop} />
      <BaseAlertDialog.Popup
        className={mergeClassName(dialogVariants({ size }), className)}
        {...props}
      />
    </BaseAlertDialog.Portal>
  );
}

export function AlertDialogTitle({ className, ...props }: BaseAlertDialog.Title.Props) {
  return <BaseAlertDialog.Title className={mergeClassName(styles.title, className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: BaseAlertDialog.Description.Props) {
  return (
    <BaseAlertDialog.Description
      className={mergeClassName(styles.description, className)}
      {...props}
    />
  );
}
