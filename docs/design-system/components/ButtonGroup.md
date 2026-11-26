# ButtonGroup

shadcn's ButtonGroup: buttons joined into one control, inner corners squared, one line between neighbours.

- Use for the Settings split button ("Export as JSON ▾"), the calendar stepper (← Today →) and a list toolbar's filter chip (its value and its ×). Do not group unrelated actions.
- **Its controls are the children with a `data-slot`** (`Button`, `Input`), as in shadcn: the corners are squared by "a slotted control after another" and "a slotted control with another after it", never by `:first-child` or `:last-child`. A menu or popover trigger mounts unslotted parts (focus guards) beside itself while it is open, and a rule by position would round the trigger's corners again.
- A control after another has no left border: the line between two is the first one's right border alone. (Overlapping the two with a negative margin would draw a translucent border twice.)
- The focused control is raised (`z-index`) so its ring is drawn over its neighbours.

**Base UI:** No Base UI part needed: a `div` with `role="group"` around Base UI `Button`s. For a split button, the chevron is a `Menu.Trigger` with `render={<Button />}`.
