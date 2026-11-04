import { forwardRef, type ReactNode } from 'react';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { mergeClassName } from '../../lib/cn';
import styles from './Switch.module.css';

export interface SwitchProps extends BaseSwitch.Root.Props {
  /** a 12px muted label to the right ("Create another"); without one, set `aria-label` */
  children?: ReactNode;
}

/** shadcn's Switch on Base UI at Figma's 32×18: settings rows and the create-task dialog. */
export const Switch = forwardRef<HTMLElement, SwitchProps>(function Switch(
  { className, children, ...props },
  ref,
) {
  const control = (
    <BaseSwitch.Root
      ref={ref}
      data-slot="switch"
      className={mergeClassName(styles.switch, className)}
      {...props}
    >
      <BaseSwitch.Thumb className={styles.thumb} />
    </BaseSwitch.Root>
  );
  if (children == null) return control;
  return (
    <label className={styles.label}>
      {control}
      {children}
    </label>
  );
});
