import type { ReactNode } from 'react';
import { Toast as BaseToast } from '@base-ui/react/toast';
import { CircleCheck, CircleX, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Icon } from '../Icon';
import styles from './Toast.module.css';

export type ToastTone = 'success' | 'warning' | 'error';

const TONES: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: styles.success },
  warning: { icon: TriangleAlert, className: styles.warning },
  error: { icon: CircleX, className: styles.error },
};

/** The app's toast queue: add toasts from anywhere, including outside React. */
export const toastManager = BaseToast.createToastManager();

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  /** `success` (status-completed), `warning` (priority-medium), `error` (destructive) */
  tone?: ToastTone;
  /** a small default button: offer Undo for reversible actions */
  action?: { label: ReactNode; onClick: () => void };
  /** ms before it closes; 0 keeps it open. Default 5000. */
  timeout?: number;
}

/**
 * Shows a toast; returns its id (for `toastManager.close(id)`).
 * `toast({ title: 'Task moved to trash', action: { label: 'Undo', onClick: restore } })`
 */
export function toast({ title, description, tone, action, timeout }: ToastOptions): string {
  return toastManager.add({
    title,
    description,
    type: tone,
    timeout,
    priority: tone === 'error' ? 'high' : 'low',
    actionProps: action && { children: action.label, onClick: action.onClick },
  });
}

/** The toast manager inside React, with the reactive list of toasts. */
export const useToast = BaseToast.useToastManager;

/** Wrap the app once: it holds the queue and draws the toasts at the window's bottom right. */
export function ToastProvider({
  children,
  ...props
}: Omit<BaseToast.Provider.Props, 'toastManager'>) {
  return (
    <BaseToast.Provider toastManager={toastManager} {...props}>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className={styles.viewport}>
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((item) => {
    const tone = item.type ? TONES[item.type as ToastTone] : undefined;
    return (
      <BaseToast.Root
        key={item.id}
        toast={item}
        swipeDirection={['right', 'down']}
        className={styles.toast}
      >
        <BaseToast.Content className={styles.content}>
          {tone && <Icon icon={tone.icon} className={tone.className} />}
          <div className={styles.text}>
            <BaseToast.Title className={styles.title} />
            <BaseToast.Description className={styles.description} />
          </div>
          <BaseToast.Action render={<Button size="sm" />} />
          <BaseToast.Close
            render={<IconButton size="xs" icon={X} label="Close" tooltip={false} />}
          />
        </BaseToast.Content>
      </BaseToast.Root>
    );
  });
}
