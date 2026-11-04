# Tooltip

shadcn's Tooltip drawn as Figma's `Tooltip`: a small dark popover, `popover` fill, `edge` outline, 8px corners, 6px × 12px padding, 12px regular `foreground` text, and an optional `shortcut` in a `Kbd` 8px after it ("Tasks G T"). (shadcn's own tooltip is inverted; DevBrain keeps it dark.)

- Names icon-only buttons and shows truncated names in full; never the only place for an action.

**Base UI:** `Tooltip.Provider`, `Tooltip.Root`, `Tooltip.Trigger`, `Tooltip.Positioner`, `Tooltip.Popup` (optional `Tooltip.Arrow`). Styles key off `data-open`, `data-side`, `data-starting-style` / `data-ending-style`.
