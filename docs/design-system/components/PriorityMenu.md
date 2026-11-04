# PriorityMenu

The menu a priority badge or icon opens, the twin of `StatusMenu`: a "Priority" label, then High, Medium and Low with their `PriorityIcon`s. The current priority is ticked and highlighted; the others show their shortcut (`⇧1`, `⇧2`, `⇧3`), which picks them while the menu is open. 200px wide, Nova's menu: `popover`, the `edge` outline, 10px corners, 28px items.

Built on `ValueMenuContent` (exported by `StatusMenu`), which draws any single-value picker of this shape.
