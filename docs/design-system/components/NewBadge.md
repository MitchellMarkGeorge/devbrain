# NewBadge

Marks an item just created on the first-run Home (Figma's `NewBadge`): a 20px pill with a `border-strong` outline, no fill, 8px side padding, "New" in 12px medium `foreground`.

- It fades out after a few seconds (`fadeAfter`, 4000ms by default, over 600ms; at once under reduced motion) and stays in place, invisible, so its row doesn't shift; `onFaded` says when to drop it. `fadeAfter={false}` keeps it.
- Not a `Badge` variant: Badge's pills are 24px with a fill and muted text, and none of them fade.

**Base UI:** No Base UI part: a `span`.
