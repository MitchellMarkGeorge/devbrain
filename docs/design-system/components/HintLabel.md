# HintLabel

Vim mode's hint label (Figma `HintLabel`, `7702:55409`; in use in `7703:57705`): the keys that click the element it sits on while `f` hints are showing. 20px tall and at least 22px wide, 4px either side, 4px corners, `swatch-amber` with `neutral-950` text in 10px `font-mono` semibold capitals (0.02em tracking), `shadow-2xl` to lift it off the page.

- **label:** the keys, as typed (`as`), drawn in capitals. One letter while few targets are on screen, two (`AA`, `AS`, `AD`, … from the home row) after.
- **typed:** how many of its keys have been typed so far; those are drawn at 45% opacity, and labels the keys typed don't start are no longer drawn.

It takes no pointer events: the keyboard layer's hint overlay (`src/renderer/keyboard/HintOverlay.tsx`) places one at the left edge of each target, centred on its height, in a fixed layer over the window.

**Base UI:** none. The overlay is `aria-hidden`: the hints are a pointer for sighted keyboard users, and every target is reachable by Tab as well.
