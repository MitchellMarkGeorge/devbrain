# UpNextStrip

Figma's `UpNextStrip`: Home's strip under the greeting. A 56px `card` with the `edge` outline and 14px corners, 16px in at the left, 12px gaps, and an 8px status dot first.

- **meeting** (the next meeting within the hour): `date-today` dot, "Up next" (12px medium `muted-foreground`), the calendar's 3×24 bar, the title (14px medium `foreground-strong`), the countdown ("In 12 min", 12px medium `date-today`), the time (12px `subtle-foreground`), the meeting's note as an `EntityPill`, and "Join" (`sm` default, video icon) at the right.
- **free** (no meeting soon): `status-in-progress` dot, "Free", how long ("Until 1:00 PM", "All day"), the time left in `status-in-progress`, "·", what's next with its 12px bar, then at the right "Good time for", a 14px status icon and a task that fits.

Hidden on days with no meetings.

**Base UI:** No Base UI part: plain markup around `Button` and `EntityPill`.
