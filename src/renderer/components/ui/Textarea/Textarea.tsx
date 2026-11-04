import { forwardRef } from 'react';
import { Field } from '@base-ui/react/field';
import { cva, type VariantProps } from 'class-variance-authority';
import { mergeClassName } from '../../lib/cn';
import styles from './Textarea.module.css';

export const textareaVariants = cva(styles.textarea, {
  variants: {
    /** `ghost` is the borderless description on document pages */
    variant: { default: undefined, ghost: styles.ghost },
  },
  defaultVariants: { variant: 'default' },
});

export interface TextareaProps
  extends Omit<Field.Control.Props, 'render'>, VariantProps<typeof textareaVariants> {
  invalid?: boolean;
  rows?: number;
}

/** shadcn's Textarea on Base UI's `Field.Control`. It grows with its text from 64px. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, variant, invalid, rows, ...props },
  ref,
) {
  return (
    <Field.Control
      ref={ref as React.Ref<HTMLInputElement>}
      data-slot="textarea"
      data-variant={variant ?? 'default'}
      aria-invalid={invalid || undefined}
      render={<textarea rows={rows} />}
      className={mergeClassName(textareaVariants({ variant }), className)}
      {...props}
    />
  );
});
