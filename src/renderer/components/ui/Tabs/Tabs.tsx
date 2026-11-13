import { forwardRef } from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import { mergeClassName } from '../../lib/cn';
import { renderIcon, type IconSource } from '../Icon';
import styles from './Tabs.module.css';

export const tabsVariants = cva(styles.root, {
  variants: {
    /**
     * `outline` (the default): page sections, drawn as ToggleGroup's outline variant;
     * `default`: the segmented control; `line`: an underline (a project's Overview / Tasks / Notes,
     * at `lg`)
     */
    variant: { outline: styles.outline, default: styles.segmented, line: styles.line },
    /**
     * `default`; `lg`: outline, 36px tabs in 16px; line, 14px labels 24px apart, for an item's
     * sub-pages at the top of its page (a project's Overview / Tasks / Notes)
     */
    size: { default: undefined, lg: styles.lg },
  },
  defaultVariants: { variant: 'outline', size: 'default' },
});

export interface TabsProps extends BaseTabs.Root.Props, VariantProps<typeof tabsVariants> {}

/**
 * Page sections: Settings (General / Tasks / Calendar / Data & storage) and an item's sub-pages
 * (Overview / Tasks / Notes). Compose `TabsList` with `TabsTab`s, then a `TabsPanel` for each.
 */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { variant, size, className, ...props },
  ref,
) {
  return (
    <BaseTabs.Root
      ref={ref}
      data-slot="tabs"
      data-variant={variant ?? 'outline'}
      className={mergeClassName(tabsVariants({ variant, size }), className)}
      {...props}
    />
  );
});

/** The row of tabs. It draws the `line` variant's underline itself. */
export const TabsList = forwardRef<HTMLDivElement, BaseTabs.List.Props>(function TabsList(
  { className, children, ...props },
  ref,
) {
  return (
    <BaseTabs.List
      ref={ref}
      data-slot="tabs-list"
      className={mergeClassName(styles.list, className)}
      {...props}
    >
      {children}
      <BaseTabs.Indicator className={styles.indicator} />
    </BaseTabs.List>
  );
});

export interface TabsTabProps extends BaseTabs.Tab.Props {
  /** a 16px icon before the label */
  icon?: IconSource;
}

export const TabsTab = forwardRef<HTMLButtonElement, TabsTabProps>(function TabsTab(
  { icon, className, children, ...props },
  ref,
) {
  return (
    <BaseTabs.Tab
      ref={ref}
      data-slot="tabs-tab"
      className={mergeClassName(styles.tab, className)}
      {...props}
    >
      {renderIcon(icon, 16)}
      {children}
    </BaseTabs.Tab>
  );
});

export const TabsPanel = forwardRef<HTMLDivElement, BaseTabs.Panel.Props>(function TabsPanel(
  { className, ...props },
  ref,
) {
  return (
    <BaseTabs.Panel
      ref={ref}
      data-slot="tabs-panel"
      className={mergeClassName(styles.panel, className)}
      {...props}
    />
  );
});
