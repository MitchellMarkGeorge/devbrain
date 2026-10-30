# Tooltip

shadcn's Tooltip drawn as a small dark popover: `popover` fill, `border-strong` outline, 8px corners, 12px medium `foreground` text. (shadcn's own tooltip is inverted; DevBrain keeps it dark.)

- Names icon-only buttons and shows truncated names in full; never the only place for an action.

**Base UI:** `Tooltip.Provider`, `Tooltip.Root`, `Tooltip.Trigger`, `Tooltip.Positioner`, `Tooltip.Popup` (optional `Tooltip.Arrow`). Styles key off `data-open`, `data-side`, `data-starting-style` / `data-ending-style`.
