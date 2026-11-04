import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { cva, type VariantProps } from 'class-variance-authority';
import styles from './Card.module.css';

export const cardVariants = cva(styles.card, {
  variants: {
    /** `compact` (12px padding and gap) for Home's summary cards, ScheduleCard and NoteCard */
    size: { default: undefined, compact: styles.compact },
  },
  defaultVariants: { size: 'default' },
});

export interface CardProps
  extends useRender.ComponentProps<'div'>, VariantProps<typeof cardVariants> {}

/**
 * shadcn's Card: a filled `card` ground with the translucent `edge` outline and 14px corners.
 * Compose it from `CardHeader` (`CardTitle`, `CardDescription`, `CardAction`), `CardContent` and
 * `CardFooter`.
 */
export function Card({ size, render, ...props }: CardProps) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cardVariants({ size }),
        'data-slot': 'card',
        'data-size': size ?? 'default',
      } as object,
      props,
    ),
  });
}

function part(slot: string, className: string, defaultTagName: 'div' | 'h3' | 'p' = 'div') {
  function CardPart({ render, ...props }: useRender.ComponentProps<'div'>) {
    return useRender({
      defaultTagName,
      render,
      props: mergeProps<'div'>({ className, 'data-slot': slot } as object, props),
    });
  }
  CardPart.displayName = slot
    .split('-')
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
  return CardPart;
}

/** The title, description and action, laid out on a two-column grid. */
export const CardHeader = part('card-header', styles.header);
/** 16px medium, `foreground-strong`. */
export const CardTitle = part('card-title', styles.title);
/** 14px `muted-foreground`. */
export const CardDescription = part('card-description', styles.description);
/** Sits on the right of the header, beside the title and description. */
export const CardAction = part('card-action', styles.action);
export const CardContent = part('card-content', styles.content);
/** A row of actions at the bottom of the card. */
export const CardFooter = part('card-footer', styles.footer);
