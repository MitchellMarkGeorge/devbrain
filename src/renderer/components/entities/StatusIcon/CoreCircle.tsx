import type { SVGProps } from 'react';

export interface CoreCircleProps extends SVGProps<SVGSVGElement> {
  size?: number;
  label?: string;
}

/**
 * The glyph DevBrain uses for work under way (an in-progress task, an active project): Lucide's
 * circle at the icon stroke, with a solid dot at its core, both in `currentColor`. Not a Lucide
 * icon: it stays in the circle family the other statuses use (empty circle, filled check).
 */
export function CoreCircle({
  size = 16,
  label = 'In progress',
  className,
  ...props
}: CoreCircleProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      className={className}
      {...props}
    >
      <circle cx={12} cy={12} r={10} fill="none" stroke="currentColor" strokeWidth={1.75} />
      <circle cx={12} cy={12} r={4.5} fill="currentColor" />
    </svg>
  );
}
