# ToggleGroup

shadcn's ToggleGroup, drawn as DevBrain's segmented control and sized as shadcn's (Nova) Tabs: a `control-md` (32px) track with a 1px `border` outline, 2px padding and 10px corners, so its items sit 3px in, as in shadcn; `size="sm"` is a `control-sm` (28px) track. Items are 1px shorter than the space inside the track (25px; 21px at `sm`), with no gap between them, 6px side padding (4px before a leading icon), 8px corners and 14px medium text (13px at `sm`, with 14px icons). The chosen one takes a thumb and `foreground` text. On keyboard focus an item's border turns `ring` with a 3px `ring` halo at 50%; on the chosen item the halo and the thumb's shadow show together. Colours differ by theme (the `segment-*` tokens):

- **Dark:** the track is on the page colour; unchosen items are `muted-foreground`; the thumb is `secondary` (`neutral-800`, so it shows on a `card` too) with Figma's `shadow-segment`, `0 1px 1px` black at 30%.
- **Light:** shadcn's Tabs, outlined: a `muted` (`neutral-100`) track, unchosen items in `foreground` at 60%, and a white thumb raised by shadcn's `shadow-sm`.

- `items`: `{ value, label?, icon?, iconColor? }`; icon-only items need a `value` that reads as a name.
- Use for calendar range (Month/Week/Day), list/grid/board view, the kind in Home's `CaptureBox` and choices inside settings rows. For page sections use `Tabs`.
- `variant="outline"`: shadcn's outline ToggleGroup with `spacing` 2. Separate 32px buttons with 10px corners and an `input` outline, 8px apart, 14px medium `foreground` labels; the pressed one fills with `accent`. An item can lead with a 16px icon, `muted-foreground` until pressed. It is how page sections are drawn (see `Tabs`) and the search dialog's type filter (All / Tasks / Notes / Projects / Events, each with its count, drawn as part of the label: "Tasks 3").

**Base UI:** `ToggleGroup` with `Toggle` items (`@base-ui/react/toggle-group`, `toggle`). Styles key off `data-pressed` on the chosen item.
