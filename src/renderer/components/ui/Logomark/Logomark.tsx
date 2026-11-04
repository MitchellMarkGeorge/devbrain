import type { ComponentPropsWithoutRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import markOnDark from '../../../assets/devbrain-logomark.svg';
import markOnLight from '../../../assets/devbrain-logomark-dark.svg';
import styles from './Logomark.module.css';

export const logomarkVariants = cva(styles.mark, {
  variants: {
    /** `sm` 20×24 in a lockup, `md` 40×48 above onboarding titles, `lg` 60×72 on the splash */
    size: { sm: styles.sm, md: styles.md, lg: styles.lg },
    pulse: { true: styles.pulse },
  },
  defaultVariants: { size: 'md' },
});

export interface LogomarkProps
  extends Omit<ComponentPropsWithoutRef<'img'>, 'src'>, VariantProps<typeof logomarkVariants> {
  /**
   * The ground it sits on: `dark` uses the white mark, `light` the `neutral-950` one. Leave it
   * unset to follow the theme (prefers-color-scheme).
   */
  ground?: 'dark' | 'light';
}

/** The DevBrain mark. An image asset: never redrawn or recoloured. */
export function Logomark({
  size,
  pulse,
  ground,
  className,
  alt = 'DevBrain',
  ...props
}: LogomarkProps) {
  const imgClass = cn(logomarkVariants({ size, pulse }), className);
  if (ground) {
    return (
      <img
        src={ground === 'dark' ? markOnDark : markOnLight}
        alt={alt}
        className={imgClass}
        {...props}
      />
    );
  }
  return (
    <picture>
      <source srcSet={markOnLight} media="(prefers-color-scheme: light)" />
      <img src={markOnDark} alt={alt} className={imgClass} {...props} />
    </picture>
  );
}

export interface LockupProps extends ComponentPropsWithoutRef<'span'> {
  ground?: 'dark' | 'light';
}

/** The mark (20×24), `space-3`, then "DevBrain" in Inter semibold. There is no wordmark file. */
export function Lockup({ ground, className, ...props }: LockupProps) {
  return (
    <span className={cn(styles.lockup, className)} {...props}>
      <Logomark size="sm" ground={ground} alt="" />
      DevBrain
    </span>
  );
}
