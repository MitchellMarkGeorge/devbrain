import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Ellipsis } from 'lucide-react';
import { cn, mergeClassName } from '../../lib/cn';
import { DialogContent, type DialogContentProps } from '../Dialog';
import { IconButton } from '../IconButton';
import { renderIcon, type IconSource } from '../Icon';
import { Switch } from '../Switch';
import styles from './CreateDialog.module.css';

export const createDialogVariants = cva(styles.content, {
  variants: {
    /** `task`: 600px (tasks, subtasks and projects). `event`: 480px. */
    size: { task: styles.sizeTask, event: styles.sizeEvent },
  },
  defaultVariants: { size: 'task' },
});

export interface CreateDialogContentProps
  extends
    Omit<DialogContentProps, 'size' | 'showClose'>,
    VariantProps<typeof createDialogVariants> {}

/**
 * The popup of a create dialog (New task, New project, New event): a `Dialog` with no × and no
 * header, its body then the `CreateDialogFooter` band. Put it in a `Dialog` as usual and give it
 * an `aria-label` ("New task"), since its title is a field.
 */
export function CreateDialogContent({ size, className, ...props }: CreateDialogContentProps) {
  return (
    <DialogContent
      showClose={false}
      className={mergeClassName(createDialogVariants({ size }), className)}
      {...props}
    />
  );
}

/** The fields: 20px from the top and 16px from the sides, its blocks 16px apart. */
export function CreateDialogBody({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn(styles.body, className)} {...props} />;
}

/**
 * The new item's title as a borderless 24px field ("Task title" while empty), with its
 * description under it.
 */
export const CreateDialogTitleInput = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<'input'>
>(function CreateDialogTitleInput({ className, ...props }, ref) {
  return <input ref={ref} type="text" className={cn(styles.title, className)} {...props} />;
});

/** The description as a borderless field that grows with its text ("Add description…"). */
export const CreateDialogDescriptionInput = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function CreateDialogDescriptionInput({ className, rows = 2, ...props }, ref) {
  return (
    <textarea ref={ref} rows={rows} className={cn(styles.description, className)} {...props} />
  );
});

/** The title over the description, 6px apart. */
export function CreateDialogFields({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn(styles.fields, className)} {...props} />;
}

export interface CreateDialogPropertiesProps extends ComponentPropsWithoutRef<'div'> {
  /** opens the less common fields (start date, "Add subtasks"); a "…" at the end of the bar */
  onMore?: () => void;
  /** the "…" as a menu trigger instead: `<DropdownMenu>` with `DropdownMenuTrigger` around it */
  more?: ReactNode;
}

/**
 * Every property as a pill, 8px apart and wrapping (status, priority, due date, project, link),
 * then "…" on the right for the rest.
 */
export function CreateDialogProperties({
  onMore,
  more,
  className,
  children,
  ...props
}: CreateDialogPropertiesProps) {
  return (
    <div className={cn(styles.properties, className)} {...props}>
      <div className={styles.pills} role="group" aria-label="Properties">
        {children}
      </div>
      {more ??
        (onMore && (
          <IconButton size="xs" tone="muted" icon={Ellipsis} label="More fields" onClick={onMore} />
        ))}
    </div>
  );
}

/** The event dialog's property list: rows of an icon and its value, 8px apart. */
export function CreateDialogFieldList({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn(styles.fieldList, className)} {...props} />;
}

export interface CreateDialogFieldProps extends ComponentPropsWithoutRef<'div'> {
  /** the 16px leading icon: clock, repeat, calendar, map pin, video, file */
  icon: IconSource;
  /** what the row sets, for screen readers ("When", "Location") */
  label: string;
}

/**
 * A row of the event dialog: a 16px `muted-foreground` icon, then pills or an input, 10px apart
 * and at least 32px tall. A multi-line value (the description) keeps the icon on its first line.
 */
export function CreateDialogField({
  icon,
  label,
  className,
  children,
  ...props
}: CreateDialogFieldProps) {
  return (
    <div role="group" aria-label={label} className={cn(styles.field, className)} {...props}>
      <span className={styles.fieldIcon}>{renderIcon(icon, 16)}</span>
      <div className={styles.fieldValue}>{children}</div>
    </div>
  );
}

export interface CreateDialogFooterProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * shows the "Create more" switch on the left, which keeps the dialog open after ⌘↵ for the
   * next item. Leave it out where it doesn't apply (projects, events).
   */
  createMore?: boolean;
  onCreateMoreChange?: (createMore: boolean) => void;
}

/**
 * The footer band: `muted` over a `border-strong` line, "Create more" on the left, then the
 * actions on the right (a `ghost` Cancel, then the `default` Create button).
 */
export function CreateDialogFooter({
  createMore,
  onCreateMoreChange,
  className,
  children,
  ...props
}: CreateDialogFooterProps) {
  return (
    <div className={cn(styles.footer, className)} {...props}>
      {createMore != null && (
        <Switch checked={createMore} onCheckedChange={(checked) => onCreateMoreChange?.(checked)}>
          Create more
        </Switch>
      )}
      <div className={styles.actions}>{children}</div>
    </div>
  );
}
