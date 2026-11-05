# ToggleGroup

shadcn's ToggleGroup, drawn as DevBrain's segmented control: a 34px track with 3px padding and 10px corners, holding 26px items with no gap between them (Figma's `SegmentItem`); items are 14px medium `muted-foreground` (8px side padding, 6px for icon-only), and the chosen one takes a thumb with 8px corners and `foreground` text. `size="sm"` keeps a 28px track (2px padding, 22px items). The track and thumb differ by theme (the `segment-*` tokens):

- **Dark:** the track is on the page colour with a `border` outline; the thumb is `secondary` (`neutral-800`, so it shows on a `card` too) with Figma's `shadow-segment`, `0 1px 1px` black at 30%.
- **Light:** shadcn's look: a `muted` (`neutral-100`) track with no outline, and a white thumb raised by shadcn's `shadow-sm`.

- `items`: `{ value, label?, icon?, iconColor? }`; icon-only items need a `value` that reads as a name.
- Use for calendar range (Month/Week/Day), list/grid/board view, the kind in Home's `CaptureBox` and choices inside settings rows. For page sections use `Tabs`.
- `variant="outline"`: shadcn's outline ToggleGroup with `spacing` 2. Separate 32px buttons with 10px corners and an `input` outline, 8px apart, 14px medium `foreground` labels; the pressed one fills with `accent`. An item can lead with a 16px icon, `muted-foreground` until pressed. It is how page sections are drawn (see `Tabs`) and the search dialog's type filter (All / Tasks / Notes / Projects / Events, each with its count, drawn as part of the label: "Tasks 3").

**Base UI:** `ToggleGroup` with `Toggle` items (`@base-ui/react/toggle-group`, `toggle`). Styles key off `data-pressed` on the chosen item.
