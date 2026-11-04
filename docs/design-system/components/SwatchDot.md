# SwatchDot

A colour as an 8px dot centred in a 12px slot, the size of a pill's glyph (Figma's `SwatchDot`). It is the glyph of the colour pill in the create and edit dialogs ("● Indigo"), where the pill opens the colour choices.

- `color`: a swatch name or a CSS colour.
- Decorative (`aria-hidden`): the pill's label names the colour.
- Not to be confused with `SwatchPicker`'s 24px squares, which are the choices themselves.

**Base UI:** No Base UI part: a `span` that takes `render`.
