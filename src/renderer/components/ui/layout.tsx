import {
  createElement,
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react';
import { ui, cx } from './styles';

export type Space = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 6 | 8 | 12 | 16;
const space = (value?: Space) =>
  value === undefined
    ? undefined
    : value === 0
      ? 0
      : `var(--space-${String(value).replace('.', '-')})`;
type CommonProps = {
  as?: ElementType;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  padding?: Space;
  paddingX?: Space;
  paddingY?: Space;
  gap?: Space;
};
export type BoxProps<T extends ElementType = 'div'> = CommonProps &
  Omit<ComponentPropsWithoutRef<T>, keyof CommonProps>;
export function Box<T extends ElementType = 'div'>({
  as,
  padding,
  paddingX,
  paddingY,
  gap,
  style,
  ...props
}: BoxProps<T>) {
  return createElement(as ?? 'div', {
    ...props,
    style: {
      padding: space(padding),
      paddingInline: space(paddingX),
      paddingBlock: space(paddingY),
      gap: space(gap),
      ...style,
    },
  });
}
export interface FlexProps extends BoxProps {
  direction?: CSSProperties['flexDirection'];
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  wrap?: CSSProperties['flexWrap'];
  inline?: boolean;
}
export function Flex({
  direction = 'row',
  align = 'center',
  justify,
  wrap,
  inline,
  style,
  ...props
}: FlexProps) {
  return (
    <Box
      {...props}
      style={{
        display: inline ? 'inline-flex' : 'flex',
        flexDirection: direction,
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap,
        minWidth: 0,
        ...style,
      }}
    />
  );
}
export function Stack({ gap = 4, ...props }: FlexProps) {
  return <Flex direction="column" align="stretch" gap={gap} {...props} />;
}
export function Grid({
  columns = 3,
  minWidth,
  style,
  ...props
}: BoxProps & { columns?: number; minWidth?: number }) {
  return (
    <Box
      {...props}
      style={{
        display: 'grid',
        gridTemplateColumns: minWidth
          ? `repeat(auto-fit, minmax(min(100%, ${minWidth}px), 1fr))`
          : `repeat(${columns}, minmax(0, 1fr))`,
        ...style,
      }}
    />
  );
}
export type TextVariant = 'body' | 'label' | 'meta' | 'code';
export interface TextProps extends ComponentPropsWithoutRef<'span'> {
  as?: 'span' | 'p' | 'div' | 'label' | 'code';
  variant?: TextVariant;
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
  tone?: 'default' | 'strong' | 'muted' | 'subtle' | 'destructive';
  weight?: 'normal' | 'medium' | 'semibold';
  truncate?: boolean;
}
export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  {
    as = 'span',
    variant = 'body',
    size,
    tone = 'default',
    weight,
    truncate,
    className,
    style,
    ...props
  },
  ref,
) {
  const textSize = size ?? (variant === 'meta' ? 'xs' : 'sm');
  return createElement(as, {
    ...props,
    ref,
    className: cx(ui('text', truncate && 'truncate'), className),
    style: {
      color: `var(--${{ default: 'foreground', strong: 'foreground-strong', muted: 'muted-foreground', subtle: 'subtle-foreground', destructive: 'destructive' }[tone]})`,
      fontFamily: variant === 'code' ? 'var(--font-mono)' : undefined,
      fontSize: `var(--text-${textSize})`,
      lineHeight: `var(--text-${textSize}-leading)`,
      fontWeight: `var(--font-weight-${weight ?? (variant === 'label' ? 'medium' : 'normal')})`,
      ...style,
    },
  });
});
export interface HeadingProps extends ComponentPropsWithoutRef<'h2'> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  variant?: 'page' | 'document' | 'section' | 'card' | 'dialog';
  truncate?: boolean;
}
export function Heading({
  as = 'h2',
  variant = 'section',
  truncate,
  className,
  style,
  ...props
}: HeadingProps) {
  const size = { page: '3xl', document: '2xl', section: 'sm', card: 'base', dialog: 'base' }[
    variant
  ];
  return createElement(as, {
    ...props,
    className: cx(ui('heading', truncate && 'truncate'), className),
    style: {
      color: 'var(--foreground-strong)',
      fontSize: `var(--text-${size})`,
      lineHeight: `var(--text-${size}-leading)`,
      fontWeight: `var(--font-weight-${variant === 'page' || variant === 'document' ? 'semibold' : 'medium'})`,
      letterSpacing:
        variant === 'page' || variant === 'document' ? 'var(--tracking-tight)' : undefined,
      ...style,
    },
  });
}
