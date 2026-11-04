# MentionMenu

The note editor's "@" menu, 320px wide under the caret, built on the `SlashMenu`'s list: groups of Tasks (their status icon), Notes (the file icon) and Events (their calendar's bar), each item's title then a quiet date or time on the right in 12px `subtle-foreground` ("Jun 24", "2h ago", "10:30 AM"). The app does the searching and passes the groups; ↑, ↓ and Enter pick through `handleRef` while the caret stays in the editor.
