# StatusLine

Vim mode's mode line (Figma `VimStatusline`, `7702:55408`; in every frame of the Vim mocks, `7703:55372`–`7714:56845`): a 28px line across the bottom of the window, in `WorkspaceShell`'s `statusLine` slot. It is part of the window's frame, under the page's card: no background or edge of its own, so the frame's `sidebar` colour shows through, as the title bar's does above the card. Shown only while Vim mode is on (Settings › Preferences › Vim keys); the default keymap has no modes and no line.

- **The mode tag** at the left, 8px in: the mode in capitals, 11px `font-mono` semibold, 0.06em tracking, `white` on the mode's colour, an 18px pill with 4px corners and 8px either side (the mocks' full-height block, rounded to sit in the frame beside the card's corners). Normal `swatch-blue`, Insert `swatch-green`, Visual `swatch-amber`, Hint `swatch-pink`, Command `swatch-indigo`. `label` replaces the text where a mode has a variant ("VISUAL LINE" in the editor).
- **Where the cursor is**, 12px after the tag, in `muted-foreground`: the page and view, and the cursor's place in a list ("Tasks › List · 3/8", "rows 2–4" in Visual). It truncates first.
- **Keys typed so far** after it, in `foreground` semibold: a count and the start of a sequence ("3d", "g"), until the keys run or are dropped.
- **Hints** at the right: the few keys worth knowing in the mode (`? keys · : command · f hints` in Normal, `Esc cancel` in Hint), keys in `foreground`, labels in `muted-foreground`, 16px apart. Written as on macOS and named for the platform (`formatKeys`). They hide on a window narrower than 720px.
- **Children** take the place of the context and the keys typed: the `:` line's input.
- **Popup**: a popover (`popover`, the `edge` outline, 8px corners, `shadow-2xl`, 6px padding) drawn above the line's left end, 4px clear of it: what can follow the keys typed (after `g`, Figma `7703:55909`) or the `:` line's completions (`7704:58025`).

It draws what it is given and binds no keys: the keyboard layer's `ModeLine` (`src/renderer/keyboard`) fills it from the dispatcher's state.

**Base UI:** none. The tag is `role="status"`, so a screen reader hears the mode change ("insert mode"); hints are a list labelled "Keys".
