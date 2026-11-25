import type { ReactNode } from 'react';
import { EntityPill, type EntityPillProps } from '../../entities/EntityPill';
import type { IconSource } from '../../ui/Icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../../ui/Popover';
import styles from './PillPopover.module.css';

export interface PillPopoverProps extends Omit<
  EntityPillProps,
  'entity' | 'glyph' | 'children' | 'title'
> {
  /** the pill's glyph: `AtSign` for mentions, `CircleCheck` for tasks */
  glyph: IconSource;
  /** the pill's label: "7 mentions", "2 tasks · 1 in progress" */
  label: ReactNode;
  /** the list's heading in the popover: "Mentioned in", "Tasks" */
  heading: string;
  /** the heading's actions on the right: xs ghost buttons ("Link", "New") */
  action?: ReactNode;
  /** uncontrolled through `defaultOpen` (closed by default), or controlled with both of these */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** the list: `MentionList`, `LinkedTaskRow`s */
  children: ReactNode;
}

/**
 * A pill on a page ("7 mentions", "2 tasks") that opens a short list in a popover under it: a
 * 340px popover headed by `heading`, with the list's actions on the right, over the rows. A page
 * shows its links this way, so it doesn't grow by them. Extra props go to the pill.
 */
export function PillPopover({
  glyph,
  label,
  heading,
  action,
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: PillPopoverProps) {
  return (
    <Popover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger render={<EntityPill interactive glyph={glyph} {...props} />}>
        {label}
      </PopoverTrigger>
      <PopoverContent size="auto" initialFocus={false} className={styles.popover}>
        <div className={styles.heading}>
          <PopoverTitle render={<span />} className={styles.title}>
            {heading}
          </PopoverTitle>
          {action}
        </div>
        <div className={styles.body}>{children}</div>
      </PopoverContent>
    </Popover>
  );
}
