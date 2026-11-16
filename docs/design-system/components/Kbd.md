# Kbd

A keyboard key: Nova's: 20px, `muted` fill, no outline, 6px corners, 4px side padding, 12px regular `muted-foreground` (Figma's `Kbd`, "⌘K"). For help, empty states and tooltips. `variant="raised"` (a key on a `muted` band, as ⌘K's Esc and footer hints) sits on `border-strong` with `foreground` text, which keeps 4.5:1 where `muted-foreground` would not. Write keys as on macOS: a text child is named for the platform, "⌘K" reading "Ctrl+K" on Windows and Linux (`formatKeys`; lone keys and sequences like "G T" stay as written).

**Base UI:** No Base UI part: a `kbd` element.
