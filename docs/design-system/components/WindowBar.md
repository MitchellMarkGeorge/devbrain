# WindowBar

Figma's `WindowBar`: the 48px strip across the window while the sidebar is the rail. The traffic lights' 52×12 slot (12px dots 8px apart), 20px, the window controls (sidebar toggle with ⌘\ in its tooltip, back, forward: 28px muted `IconButton`s 8px apart), 16px, then the page's `PageHeader` (breadcrumb at the left, actions at the right), on `background`, 16px in at the left and 24px at the right. The strip drags the window; its buttons don't.

`TrafficLights` and `WindowControls` are exported on their own: the full sidebar's 44px window row uses them too. `AppShell` places the bar; pages never render it themselves.

**Base UI:** No Base UI part: plain markup with `IconButton`s.
