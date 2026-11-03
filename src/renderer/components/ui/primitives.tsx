import { forwardRef, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { Input as BaseInput } from '@base-ui/react/input';
import { Field as BaseField } from '@base-ui/react/field';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { Separator as BaseSeparator } from '@base-ui/react/separator';
import { Progress as BaseProgress } from '@base-ui/react/progress';
import { iconRegistry } from './icons';
import { ui, cx, colorValue, percent } from './styles';
import type { TaskStatus, Priority, Health, Swatch } from './types';
import logo from '../../assets/devbrain-logomark.svg';

export interface IconProps extends Omit<ComponentProps<'svg'>, 'name'> {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  label?: string;
}
export function Icon({
  name,
  size = 16,
  color,
  strokeWidth = 1.75,
  label,
  className,
  ...props
}: IconProps) {
  const key = name.replace(/(^|-)(\w)/g, (_, _dash: string, letter: string) =>
    letter.toUpperCase(),
  );
  const Glyph = iconRegistry[key] ?? iconRegistry.CircleQuestionMark;
  return (
    <Glyph
      {...props}
      className={cx(ui('db-icon'), className)}
      size={size}
      color={colorValue(color)}
      strokeWidth={strokeWidth}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
export const glyph = (icon: ReactNode, size = 16, color?: string) =>
  typeof icon === 'string' ? <Icon name={icon} size={size} color={color} /> : icon;

export interface ButtonProps extends Omit<
  ComponentProps<typeof BaseButton>,
  'className' | 'value'
> {
  className?: string;
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'xs' | 'icon' | 'icon-sm' | 'icon-xs';
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  value?: ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'default',
    size = 'default',
    icon,
    trailingIcon,
    value,
    children,
    className,
    ...props
  },
  ref,
) {
  return (
    <BaseButton
      ref={ref}
      type="button"
      {...props}
      data-variant={variant}
      data-size={size}
      className={cx(ui('db-btn', value !== undefined && 'db-btn-has-value'), className)}
    >
      {glyph(icon)}
      {value !== undefined ? (
        <>
          <span className={ui('db-btn-label')}>{children}</span>
          <span className={ui('db-btn-value')}>{value}</span>
        </>
      ) : (
        children
      )}
      {glyph(trailingIcon)}
    </BaseButton>
  );
});
export function ButtonGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div role="group" {...props} className={cx(ui('db-btn-group'), className)} />;
}

export interface BadgeProps extends Omit<ComponentProps<'span'>, 'prefix'> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  icon?: ReactNode;
  iconColor?: string;
  barColor?: string;
  prefix?: string;
  muted?: boolean;
}
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'outline', icon, iconColor, barColor, prefix, muted, children, className, ...props },
  ref,
) {
  return (
    <span ref={ref} {...props} className={cx(ui('db-badge'), className)} data-variant={variant}>
      {glyph(icon, 12, iconColor)}
      {barColor && <ColorBar color={barColor} />}
      {prefix && <span className={ui('db-badge-muted')}>{prefix}</span>}
      <span className={ui('db-badge-text', muted && 'db-badge-muted')}>{children}</span>
    </span>
  );
});
export function ColorBar({ color = 'blue' }: { color?: string }) {
  return (
    <span aria-hidden="true" className={ui('db-bar')} style={{ background: colorValue(color) }} />
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  ComponentProps<typeof BaseInput> & { invalid?: boolean }
>(function Input({ invalid, className, ...props }, ref) {
  return (
    <BaseInput
      ref={ref}
      {...props}
      aria-invalid={invalid || props['aria-invalid']}
      className={cx(ui('db-input'), typeof className === 'string' ? className : undefined)}
    />
  );
});
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  ComponentProps<'textarea'> & { variant?: 'default' | 'ghost' }
>(function Textarea({ variant = 'default', className, ...props }, ref) {
  return (
    <BaseField.Control
      render={<textarea ref={ref} {...props} />}
      className={cx(ui('db-textarea'), className)}
      data-variant={variant}
    />
  );
});
export interface FieldProps extends Omit<ComponentProps<typeof BaseField.Root>, 'className'> {
  className?: string;
  id: string;
  label: ReactNode;
  description?: ReactNode;
  error?: string;
}
export function Field({
  id,
  label,
  description,
  error,
  children,
  className,
  ...props
}: FieldProps) {
  return (
    <BaseField.Root
      {...props}
      invalid={!!error || props.invalid}
      className={cx(ui('db-field'), className)}
    >
      <BaseField.Label nativeLabel htmlFor={id} className={ui('db-label')}>
        {label}
      </BaseField.Label>
      {children}
      {description && <BaseField.Description>{description}</BaseField.Description>}
      {error && (
        <BaseField.Error match className={ui('db-field-error')}>
          {error}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}
export interface CheckboxProps extends Omit<ComponentProps<typeof BaseCheckbox.Root>, 'className'> {
  className?: string;
  label?: ReactNode;
}
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { label, className, ...props },
  ref,
) {
  const control = (
    <BaseCheckbox.Root ref={ref} {...props} className={cx(ui('db-check'), className)}>
      <BaseCheckbox.Indicator>
        <Icon name={props.indeterminate ? 'minus' : 'check'} size={12} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
  return label ? (
    <label className={ui('control-label')}>
      {control}
      {label}
    </label>
  ) : (
    control
  );
});
export interface SwitchProps extends Omit<ComponentProps<typeof BaseSwitch.Root>, 'className'> {
  className?: string;
  label?: ReactNode;
}
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { label, className, ...props },
  ref,
) {
  const control = (
    <BaseSwitch.Root ref={ref} {...props} className={cx(ui('db-switch'), className)}>
      <BaseSwitch.Thumb className={ui('db-switch-thumb')} />
    </BaseSwitch.Root>
  );
  return label ? (
    <label className={ui('db-switch-wrap')}>
      {control}
      {label}
    </label>
  ) : (
    control
  );
});
export function Separator(props: ComponentProps<typeof BaseSeparator>) {
  return <BaseSeparator {...props} className={ui('db-sep')} />;
}
export function Skeleton({
  width = '100%',
  height = 16,
  style,
  className,
  ...props
}: ComponentProps<'div'> & { width?: CSSProperties['width']; height?: CSSProperties['height'] }) {
  return (
    <div
      aria-hidden="true"
      {...props}
      className={cx(ui('db-skeleton'), className)}
      style={{ width, height, ...style }}
    />
  );
}
export function Progress({
  value,
  label = 'Progress',
  ...props
}: Omit<ComponentProps<typeof BaseProgress.Root>, 'className'> & { label?: string }) {
  return (
    <BaseProgress.Root {...props} value={value == null ? null : percent(value)} aria-label={label}>
      <BaseProgress.Track className={ui('db-progress')}>
        <BaseProgress.Indicator />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return <kbd {...props} className={cx(ui('db-kbd'), className)} />;
}
export function StatusIcon({ status, size = 16 }: { status: TaskStatus; size?: number }) {
  return (
    <Icon
      name={
        {
          'not-started': 'circle',
          'in-progress': 'activity',
          completed: 'circle-check',
          cancelled: 'circle-slash',
          overdue: 'flag',
        }[status]
      }
      size={size}
      color={`var(--status-${status})`}
      label={status.replaceAll('-', ' ')}
      className={status === 'completed' ? ui('filled-status') : undefined}
    />
  );
}
export function PriorityIcon({ priority, size = 16 }: { priority: Priority; size?: number }) {
  return (
    <Icon
      name={{ high: 'chevrons-up', medium: 'equal', low: 'chevron-down' }[priority]}
      size={size}
      color={`var(--priority-${priority})`}
      label={`${priority} priority`}
    />
  );
}
export function HealthIcon({ health, size = 16 }: { health: Health; size?: number }) {
  return (
    <Icon
      name={
        {
          'on-track': 'clock',
          'at-risk': 'circle-alert',
          'off-track': 'circle-x',
          'not-started': 'circle',
          completed: 'circle-check',
        }[health]
      }
      size={size}
      color={`var(--health-${health})`}
      label={health.replaceAll('-', ' ')}
    />
  );
}
export function ProgressRing({
  value,
  total,
  size = 14,
  stroke = 2,
  color = 'var(--status-in-progress)',
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${value} of ${total} completed`}
      className={ui('db-icon')}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--input)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colorValue(color)}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent(value, total) / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeLinecap="round"
      />
    </svg>
  );
}
export function WorkspaceTile({
  letter,
  color = 'blue',
  size = 20,
}: {
  letter: string;
  color?: Swatch;
  size?: number;
}) {
  return (
    <span
      className={ui('db-tile')}
      style={{
        width: size,
        height: size,
        background: `var(--swatch-${color}-tile)`,
        borderRadius: size > 32 ? 16 : 4,
        fontSize: size > 32 ? 24 : 12,
      }}
    >
      {letter.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function Logomark({ size = 40, lockup = false }: { size?: number; lockup?: boolean }) {
  return (
    <span className={ui('logo-lockup')}>
      <img className={ui('logomark')} src={logo} width={size} height={size * 1.2} alt="DevBrain" />
      {lockup && <span>DevBrain</span>}
    </span>
  );
}
