# Switch

shadcn's Switch as Figma's `Switch`: a 32×18px track (`input` off, `primary` on) with a 16px thumb inset 1px in `background` (`foreground` when off in the dark theme, as shadcn draws it), label in 12px `muted-foreground` to the right. Settings rows and the create-task dialog. (Was 28×16 with a 10px thumb; Figma draws one size.)

**Base UI:** `Switch.Root` and `Switch.Thumb`. Styles key off `data-checked` / `data-unchecked` on both parts.
