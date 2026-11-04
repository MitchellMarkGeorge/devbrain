import { Popover as BasePopover } from '@base-ui/react/popover';
import { cva, type VariantProps } from 'class-variance-authority';
import { mergeClassName } from '../../lib/cn';
import styles from './Popover.module.css';

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;

export const popoverVariants = cva(styles.popup, {
  variants: {
    /** `default` is 288px with 10px padding; `auto` fits its content (a calendar, a list) */
    size: { default: styles.sizeDefault, auto: styles.sizeAuto },
  },
  defaultVariants: { size: 'default' },
});

export interface PopoverContentProps
  extends BasePopover.Popup.Props, VariantProps<typeof popoverVariants> {
  side?: BasePopover.Positioner.Props['side'];
  align?: BasePopover.Positioner.Props['align'];
  sideOffset?: number;
  alignOffset?: number;
}

/**
 * The popover's surface, portalled and positioned 4px from its trigger.
 * ```tsx
 * <Popover>
 *   <PopoverTrigger render={<Badge />}>Due Jul 1</PopoverTrigger>
 *   <PopoverContent size="auto"><Calendar /></PopoverContent>
 * </Popover>
 * ```
 */
export function PopoverContent({
  size,
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  alignOffset,
  className,
  ...props
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className={styles.positioner}
      >
        <BasePopover.Popup
          className={mergeClassName(popoverVariants({ size }), className)}
          {...props}
        />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export function PopoverTitle({ className, ...props }: BasePopover.Title.Props) {
  return <BasePopover.Title className={mergeClassName(styles.title, className)} {...props} />;
}

export function PopoverDescription({ className, ...props }: BasePopover.Description.Props) {
  return (
    <BasePopover.Description className={mergeClassName(styles.description, className)} {...props} />
  );
}
