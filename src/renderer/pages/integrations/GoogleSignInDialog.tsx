import { LoaderCircle } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  ProviderTile,
} from '../../components';
import { KeyScope } from '../../keyboard';
import type { ModalProps } from '../../modals';
import styles from './IntegrationsPage.module.css';

export interface GoogleSignInDialogProps extends ModalProps {
  /** "Connect Google Calendar", "Reconnect Google Calendar" */
  title: string;
  /** the account being reconnected, or the workspace it is connecting to */
  subtitle: string;
  /** stops waiting: cancels the sign-in in main */
  onCancel: () => void;
}

/**
 * Google's sign-in, waiting (Figma `7175:34542`): main has opened Google's page in the browser,
 * and this waits for it to come back. Cancel, Esc or a click outside cancels the sign-in; the
 * caller closes it once the sign-in has ended either way.
 */
export function GoogleSignInDialog({
  title,
  subtitle,
  onCancel,
  ...modal
}: GoogleSignInDialogProps) {
  const onOpenChange = (open: boolean) => {
    if (!open) onCancel();
    modal.onOpenChange(open);
  };
  return (
    <Dialog {...modal} onOpenChange={onOpenChange}>
      <DialogContent showClose={false}>
        <KeyScope name="dialog" />
        <DialogHeader className={styles.dialogHeader}>
          <ProviderTile provider="google-calendar" size={32} />
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </div>
        </DialogHeader>
        <div className={styles.waiting} role="status">
          <Icon icon={LoaderCircle} size={20} className={styles.spinner} />
          <p className={styles.waitingTitle}>Finish signing in in your browser…</p>
          <p className={styles.waitingText}>
            Google’s sign-in page opened in your default browser. Allow access there and DevBrain
            picks up from here.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
