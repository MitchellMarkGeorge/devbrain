import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Icon } from '../../ui/Icon';
import styles from './AddSlot.module.css';

export const addSlotVariants = cva(styles.slot, {
  variants: {
    /** `default` 40px (sheets: "Add a note", "Link a task"); `lg` 60px (a task page's note) */
    size: { default: undefined, lg: styles.sizeLg },
  },
  defaultVariants: { size: 'default' },
});

export interface AddSlotProps
  extends ComponentPropsWithoutRef<'button'>, VariantProps<typeof addSlotVariants> {}

/**
 * The dashed invitation where something can be added but nothing is yet: "+ Add a task note",
 * "+ Add a note", "+ Link a task". A full-width button; hovering fills it and lifts the label.
 */
export const AddSlot = forwardRef<HTMLButtonElement, AddSlotProps>(function AddSlot(
  { size, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(addSlotVariants({ size }), className)} {...props}>
      <Icon icon={Plus} size={16} />
      <span className={styles.label}>{children}</span>
    </button>
  );
});
