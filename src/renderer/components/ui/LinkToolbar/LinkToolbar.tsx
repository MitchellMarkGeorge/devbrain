import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Toolbar } from '@base-ui/react/toolbar';
import { CornerDownLeft, Link, SquareArrowOutUpRight, Unlink } from 'lucide-react';
import { cn } from '../../lib/cn';
import { FormatToolbarButton, FormatToolbarSeparator } from '../FormatToolbar';
import { Icon } from '../Icon';
import styles from './LinkToolbar.module.css';

export interface LinkToolbarProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'onSubmit' | 'defaultValue'
> {
  /** the link's address; empty for a new link */
  value: string;
  onValueChange?: (value: string) => void;
  /** Enter in the field: applies the link */
  onSubmit?: (value: string) => void;
  /** opens the link in the browser (shown once there is a link) */
  onOpenLink?: () => void;
  /** removes the link from the text, keeping the text */
  onRemove?: () => void;
  /** focuses the field when it opens */
  autoFocus?: boolean;
  placeholder?: string;
}

/**
 * The link editor, 340px wide, 4px under the link or the selection. Empty, it is a field
 * ("Paste or type a link…") with ↵ to apply; with a link, the address (cut with "…") then
 * Open link and Remove link.
 */
export const LinkToolbar = forwardRef<HTMLDivElement, LinkToolbarProps>(function LinkToolbar(
  {
    value,
    onValueChange,
    onSubmit,
    onOpenLink,
    onRemove,
    autoFocus,
    placeholder = 'Paste or type a link…',
    className,
    ...props
  },
  ref,
) {
  const filled = value.length > 0;
  return (
    <Toolbar.Root
      ref={ref}
      aria-label="Link"
      className={cn(styles.toolbar, className)}
      data-state={filled ? 'filled' : 'empty'}
      {...props}
    >
      <label className={styles.field}>
        <Icon icon={Link} size={16} className={styles.icon} />
        <Toolbar.Input
          className={styles.input}
          value={value}
          placeholder={placeholder}
          aria-label="Link address"
          autoFocus={autoFocus}
          onChange={(event) => onValueChange?.(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSubmit?.(value);
            }
          }}
        />
        {!filled && (
          <kbd className={styles.enter} aria-label="Enter to apply">
            <Icon icon={CornerDownLeft} size={12} />
          </kbd>
        )}
      </label>
      {filled && (
        <>
          <FormatToolbarSeparator />
          <FormatToolbarButton
            icon={SquareArrowOutUpRight}
            label="Open link"
            onClick={onOpenLink}
          />
          <FormatToolbarButton icon={Unlink} label="Remove link" onClick={onRemove} />
        </>
      )}
    </Toolbar.Root>
  );
});
