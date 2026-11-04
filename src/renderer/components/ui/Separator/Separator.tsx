import { forwardRef } from 'react';
import { Separator as BaseSeparator } from '@base-ui/react/separator';
import { mergeClassName } from '../../lib/cn';
import styles from './Separator.module.css';

export type SeparatorProps = BaseSeparator.Props;

/** A 1px `border` line, horizontal or vertical (`orientation="vertical"`). */
export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { className, orientation = 'horizontal', ...props },
  ref,
) {
  return (
    <BaseSeparator
      ref={ref}
      data-slot="separator"
      orientation={orientation}
      className={mergeClassName(styles.separator, className)}
      {...props}
    />
  );
});
