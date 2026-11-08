import type { ReactNode } from 'react';
import { TaskStatus } from '@common/types';
import { Toast as BaseToast } from '@base-ui/react/toast';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { Button } from '../Button';
import { Icon } from '../Icon';
// the one ui component that draws an entity: success is the completed status circle (Toast.md)
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { StatusIcon } from '../../entities/StatusIcon';
import styles from './Toast.module.css';

export type ToastTone = 'success' | 'warning' | 'error';

// success is the filled completed circle; error the destructive alert circle
const TONES: Record<ToastTone, ReactNode> = {
  success: <StatusIcon status={TaskStatus.COMPLETED} className={styles.icon} />,
  warning: <Icon icon={TriangleAlert} className={`${styles.icon} ${styles.warning}`} />,
  error: <Icon icon={CircleAlert} className={`${styles.icon} ${styles.error}`} />,
};

/** The app's toast queue: add toasts from anywhere, including outside React. */
export const toastManager = BaseToast.createToastManager();

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  /** `success` (status-completed), `warning` (priority-medium), `error` (destructive) */
  tone?: ToastTone;
  /** a 24px default button: offer Undo for reversible actions, Retry for a failed sync */
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

/**
 * Wrap the app once: it holds the queue and draws the toasts at the window's bottom right, 16px
 * from its edges. Toasts stack: the newest in front, the two before it peeking 10px above it,
 * each 20px narrower; hovering the stack spreads it into a column 8px apart.
 */
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
  // newest first: the first is the front one, even while it leaves
  return toasts.map((item, index) => {
    const tone = item.type ? TONES[item.type as ToastTone] : undefined;
    return (
      <BaseToast.Root
        key={item.id}
        toast={item}
        swipeDirection={['right', 'down']}
        data-front={index === 0 ? '' : undefined}
        className={styles.toast}
      >
        <BaseToast.Content className={styles.content}>
          {tone}
          <div className={styles.text}>
            <BaseToast.Title className={styles.title} />
            <BaseToast.Description className={styles.description} />
          </div>
          <BaseToast.Action className={styles.action} render={<Button size="xs" />} />
        </BaseToast.Content>
      </BaseToast.Root>
    );
  });
}
