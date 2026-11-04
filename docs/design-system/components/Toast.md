# Toast

Toasts, drawn as Figma's `Toast`: 356px, `popover` fill, the `edge` outline, 14px corners, 14px × 16px padding, `shadow-2xl`, 12px between icon, text and action. Bottom-right, 16px from the window's edges. No close button: they time out (5s), swipe away right or down, and Esc dismisses.

- Title 14px medium `foreground-strong`; description 12px `muted-foreground`, 2px below.
- Action: a 24px `default` button (`xs`): Undo for reversible actions (moved to trash), Retry for a failed sync.
- `tone`: `success` (the filled completed circle, `status-completed`), `error` (an alert circle in `destructive`), `warning` (`priority-medium`). Without an action the icon sits on the title's line; with one, everything centres.
- **Stack:** the newest toast in front; the two before it peek 10px above it, each 20px narrower; pointing at the stack spreads it into a column 8px apart.
- **Motion** (`duration-slow`, `ease-surface`): a new toast rises in from just below the window's edge as it fades in, while the ones behind shift back and shrink. Spreading and restacking move on the same curve. A toast that times out or is dismissed fades where it is and the rest close up; the front one also sinks back below the edge; a swiped one carries on in the swipe's direction. Nothing moves under `prefers-reduced-motion`.

**Base UI:** `Toast.Provider`, `Toast.Viewport`, `Toast.Root`, `Toast.Content`, `Toast.Title`, `Toast.Description`, `Toast.Action` (Base UI's toasts replace shadcn's Sonner). Pass the tone as the toast `type`. Styles key off `data-expanded`, `data-behind`, `data-starting-style` / `data-ending-style`, `data-swipe-direction` and the `--toast-index` / `--toast-offset-y` variables.
