import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import styles from './Heading.module.css';

export const headingVariants = cva(styles.heading, {
  variants: {
    /**
     * `page` 30px, `document` 24px (task, note and project titles), `title` 16px (dialogs and
     * cards), `section` 14px (above settings groups), `label` 12px uppercase (result groups)
     */
    variant: {
      page: styles.page,
      document: styles.document,
      title: styles.title,
      section: styles.section,
      label: styles.label,
    },
    truncate: { true: styles.truncate },
  },
});

type HeadingVariant = NonNullable<VariantProps<typeof headingVariants>['variant']>;
type Level = 1 | 2 | 3 | 4 | 5 | 6;

const VARIANT_BY_LEVEL: Record<Level, HeadingVariant> = {
  1: 'page',
  2: 'document',
  3: 'title',
  4: 'section',
  5: 'section',
  6: 'label',
};

export interface HeadingProps
  extends useRender.ComponentProps<'h2'>,
    VariantProps<typeof headingVariants> {
  /** the `h1`–`h6` element; the look follows it unless `variant` is set */
  level?: Level;
}

/** A heading on the type scale: `<Heading level={1}>Tasks</Heading>`, `<Heading level={3} variant="section">`. */
export function Heading({ level = 2, variant, truncate, render, ...props }: HeadingProps) {
  return useRender({
    defaultTagName: `h${level}`,
    render,
    props: mergeProps<'h2'>(
      { className: headingVariants({ variant: variant ?? VARIANT_BY_LEVEL[level], truncate }) },
      props,
    ),
  });
}
