/* @ds-bundle: {"format":4,"namespace":"DevBrain","components":[{"name":"Icon"},{"name":"Button"},{"name":"ButtonGroup"},{"name":"Badge"},{"name":"ToggleGroup"},{"name":"Tabs"},{"name":"Input"},{"name":"Textarea"},{"name":"Field"},{"name":"Checkbox"},{"name":"Switch"},{"name":"DropdownMenu"},{"name":"Command"},{"name":"Tooltip"},{"name":"Dialog"},{"name":"Sheet"},{"name":"Toast"},{"name":"Card"},{"name":"Separator"},{"name":"Skeleton"},{"name":"Progress"},{"name":"Kbd"},{"name":"Breadcrumb"},{"name":"Sidebar"},{"name":"Calendar"},{"name":"StatusIcon"},{"name":"PriorityIcon"},{"name":"HealthIcon"},{"name":"ProgressRing"},{"name":"EntityPill"},{"name":"PropertyPanel"},{"name":"TaskRow"},{"name":"GroupHeading"},{"name":"EventRow"},{"name":"ScheduleCard"},{"name":"NoteCard"},{"name":"WorkspaceTile"},{"name":"SwatchPicker"},{"name":"SettingsGroup"},{"name":"EventBlock"},{"name":"StatusMenu"},{"name":"TaskList"},{"name":"SelectionBar"},{"name":"BoardColumn"},{"name":"BoardCard"}]} */
(function () {
  var R = window.React;
  var h = R.createElement;
  var useState = R.useState;

  function cx() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  /* Lucide icons (ISC licence), 24-unit grid, as shadcn uses them. */
  var C10 = ['circle', { cx: 12, cy: 12, r: 10 }];
  function P(d) {
    return ['path', { d: d }];
  }
  function RECT(x, y, w, hh, rx) {
    return ['rect', { x: x, y: y, width: w, height: hh, rx: rx }];
  }
  var ICONS = {
    circle: [C10],
    'circle-check': [C10, P('m9 12 2 2 4-4')],
    'circle-alert': [C10, P('M12 8v4'), P('M12 16h.01')],
    'circle-x': [C10, P('m15 9-6 6'), P('m9 9 6 6')],
    'circle-slash': [C10, P('M9 15 15 9')],
    'circle-help': [C10, P('M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'), P('M12 17h.01')],
    activity: [
      P(
        'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
      ),
    ],
    flag: [P('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'), P('M4 22v-7')],
    clock: [C10, P('M12 6v6l4 2')],
    'chevrons-up': [P('m17 11-5-5-5 5'), P('m17 18-5-5-5 5')],
    'chevrons-up-down': [P('m7 15 5 5 5-5'), P('m7 9 5-5 5 5')],
    equal: [P('M5 9h14'), P('M5 15h14')],
    'chevron-down': [P('m6 9 6 6 6-6')],
    'chevron-right': [P('m9 18 6-6-6-6')],
    'chevron-left': [P('m15 18-6-6 6-6')],
    folder: [
      P(
        'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
      ),
    ],
    'file-text': [
      P('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'),
      P('M14 2v4a2 2 0 0 0 2 2h4'),
      P('M10 9H8'),
      P('M16 13H8'),
      P('M16 17H8'),
    ],
    calendar: [P('M8 2v4'), P('M16 2v4'), RECT(3, 4, 18, 18, 2), P('M3 10h18')],
    house: [
      P('M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'),
      P(
        'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      ),
    ],
    zap: [
      P(
        'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
      ),
    ],
    settings: [
      P(
        'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
      ),
      ['circle', { cx: 12, cy: 12, r: 3 }],
    ],
    search: [['circle', { cx: 11, cy: 11, r: 8 }], P('m21 21-4.3-4.3')],
    'square-pen': [
      P('M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'),
      P(
        'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z',
      ),
    ],
    star: [
      P(
        'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
      ),
    ],
    ellipsis: [
      ['circle', { cx: 5, cy: 12, r: 1 }],
      ['circle', { cx: 12, cy: 12, r: 1 }],
      ['circle', { cx: 19, cy: 12, r: 1 }],
    ],
    plus: [P('M5 12h14'), P('M12 5v14')],
    'list-filter': [P('M3 6h18'), P('M7 12h10'), P('M10 18h4')],
    'arrow-up-down': [P('m21 16-4 4-4-4'), P('M17 20V4'), P('m3 8 4-4 4 4'), P('M7 4v16')],
    video: [
      P('m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5'),
      RECT(2, 6, 14, 12, 2),
    ],
    'corner-down-right': [P('m15 10 5 5-5 5'), P('M4 4v7a4 4 0 0 0 4 4h12')],
    'arrow-left': [P('m12 19-7-7 7-7'), P('M19 12H5')],
    'arrow-right': [P('M5 12h14'), P('m12 5 7 7-7 7')],
    x: [P('M18 6 6 18'), P('m6 6 12 12')],
    check: [P('M20 6 9 17l-5-5')],
    'trash-2': [
      P('M3 6h18'),
      P('M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'),
      P('M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'),
    ],
    archive: [RECT(2, 3, 20, 5, 1), P('M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8'), P('M10 12h4')],
    'triangle-alert': [
      P('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'),
      P('M12 9v4'),
      P('M12 17h.01'),
    ],
    list: [
      P('M3 12h.01'),
      P('M3 18h.01'),
      P('M3 6h.01'),
      P('M8 12h13'),
      P('M8 18h13'),
      P('M8 6h13'),
    ],
    'layout-grid': [
      RECT(3, 3, 7, 7, 1),
      RECT(14, 3, 7, 7, 1),
      RECT(14, 14, 7, 7, 1),
      RECT(3, 14, 7, 7, 1),
    ],
    'columns-3': [RECT(3, 3, 18, 18, 2), P('M9 3v18'), P('M15 3v18')],
    type: [P('M4 7V4h16v3'), P('M9 20h6'), P('M12 4v16')],
    heading: [P('M6 12h12'), P('M6 20V4'), P('M18 20V4')],
    'list-checks': [
      P('m3 17 2 2 4-4'),
      P('m3 7 2 2 4-4'),
      P('M13 6h8'),
      P('M13 12h8'),
      P('M13 18h8'),
    ],
    code: [P('m16 18 6-6-6-6'), P('m8 6-6 6 6 6')],
    link: [
      P('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'),
      P('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
    ],
    'square-arrow-out-up-right': [
      P('M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6'),
      P('m21 3-9 9'),
      P('M15 3h6v6'),
    ],
    'rotate-ccw': [P('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'), P('M3 3v5h5')],
    'maximize-2': [P('M15 3h6v6'), P('m21 3-7 7'), P('m3 21 7-7'), P('M9 21H3v-6')],
  };

  function Icon(props) {
    var size = props.size || 16;
    var parts = ICONS[props.name] || ICONS.circle;
    return h(
      'svg',
      {
        className: cx('db-icon', props.className),
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: props.strokeWidth || 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: props.color ? { color: props.color } : undefined,
        'aria-hidden': props.label ? undefined : true,
        'aria-label': props.label,
        role: props.label ? 'img' : undefined,
      },
      parts.map(function (p, i) {
        return h(p[0], Object.assign({ key: i }, p[1]));
      }),
    );
  }

  /* Filled check circle: the completed state of tasks and projects. */
  function FilledCheck(props) {
    var size = props.size || 16;
    return h(
      'svg',
      {
        className: 'db-icon',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        role: 'img',
        'aria-label': 'Completed',
      },
      h('circle', { cx: 12, cy: 12, r: 10.5, fill: props.color }),
      h('path', {
        d: 'm8 12 3 3 5-6',
        fill: 'none',
        stroke: 'var(--background)',
        strokeWidth: 2.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }),
    );
  }

  function iconOf(icon, size, color) {
    if (!icon) return null;
    return typeof icon === 'string' ? h(Icon, { name: icon, size: size, color: color }) : icon;
  }

  /* ---------- shadcn base components ---------- */

  function Button(props) {
    var size = props.size || 'default';
    var small = size === 'xs' || size === 'icon-xs' || size === 'icon-sm';
    return h(
      'button',
      {
        type: props.type || 'button',
        className: cx('db-btn', props.className),
        'data-slot': 'button',
        'data-variant': props.variant || 'default',
        'data-size': size,
        disabled: props.disabled,
        onClick: props.onClick,
        'aria-label': props['aria-label'],
      },
      iconOf(props.icon, small ? 12 : 16),
      props.children,
      iconOf(props.trailingIcon, small ? 12 : 16),
    );
  }

  function ButtonGroup(props) {
    return h(
      'div',
      { className: 'db-btn-group', role: 'group', 'data-slot': 'button-group' },
      props.children,
    );
  }

  function Badge(props) {
    var Tag = props.onClick || props.asButton ? 'button' : 'span';
    return h(
      Tag,
      {
        className: cx('db-badge', props.className),
        'data-slot': 'badge',
        'data-variant': props.variant || 'default',
        onClick: props.onClick,
        type: Tag === 'button' ? 'button' : undefined,
        title: typeof props.children === 'string' ? props.children : undefined,
      },
      props.barColor
        ? h('span', { className: 'db-bar', style: { background: props.barColor } })
        : null,
      iconOf(props.icon, 12, props.iconColor),
      props.prefix ? h('span', { className: 'db-badge-muted' }, props.prefix) : null,
      h(
        'span',
        { className: cx('db-badge-text', props.muted && 'db-badge-muted') },
        props.children,
      ),
    );
  }

  function ToggleGroup(props) {
    var s = useState(props.defaultValue || (props.items[0] && props.items[0].value));
    return h(
      'div',
      {
        className: 'db-toggle-group',
        role: 'group',
        'aria-label': props.label,
        'data-variant': props.variant || 'default',
      },
      props.items.map(function (it) {
        return h(
          'button',
          {
            key: it.value,
            type: 'button',
            className: 'db-toggle',
            'data-variant': props.variant || 'default',
            'data-size': props.size,
            'data-pressed': s[0] === it.value ? '' : undefined,
            'aria-pressed': s[0] === it.value,
            'aria-label': it.label ? undefined : it.value,
            onClick: function () {
              s[1](it.value);
            },
          },
          iconOf(it.icon, 16, it.iconColor),
          it.label,
        );
      }),
    );
  }

  function Tabs(props) {
    var s = useState(props.defaultValue || props.items[0]);
    var line = props.variant === 'line';
    return h(
      'div',
      { className: line ? 'db-tabs-line' : 'db-tabs-list', role: 'tablist' },
      props.items.map(function (it) {
        return h(
          'button',
          {
            key: it,
            type: 'button',
            role: 'tab',
            className: 'db-tab',
            'data-active': s[0] === it ? '' : undefined,
            'aria-selected': s[0] === it,
            onClick: function () {
              s[1](it);
            },
          },
          it,
        );
      }),
    );
  }

  function Input(props) {
    return h('input', {
      id: props.id,
      className: 'db-input',
      'data-slot': 'input',
      placeholder: props.placeholder,
      defaultValue: props.defaultValue,
      'aria-invalid': props.invalid ? 'true' : undefined,
      'aria-label': props.id ? undefined : props.placeholder,
    });
  }

  function Textarea(props) {
    return h('textarea', {
      id: props.id,
      className: 'db-textarea',
      'data-slot': 'textarea',
      placeholder: props.placeholder,
      defaultValue: props.defaultValue,
      'aria-label': props.id ? undefined : props.placeholder,
    });
  }

  function Field(props) {
    return h(
      'div',
      { className: 'db-field' },
      h('label', { className: 'db-label', htmlFor: props.id }, props.label),
      props.children,
      props.error
        ? h('p', { className: 'db-field-error', style: { margin: 0 } }, props.error)
        : null,
    );
  }

  function Checkbox(props) {
    var s = useState(!!props.defaultChecked);
    return h(
      'button',
      {
        type: 'button',
        role: 'checkbox',
        className: 'db-check',
        'data-checked': s[0] ? '' : undefined,
        'data-unchecked': s[0] ? undefined : '',
        'aria-checked': s[0],
        'aria-label': props.label || 'Select',
        onClick: function () {
          s[1](!s[0]);
        },
      },
      s[0] ? h(Icon, { name: 'check', size: 14, strokeWidth: 3 }) : null,
    );
  }

  function Switch(props) {
    var s = useState(!!props.defaultChecked);
    return h(
      'label',
      { className: 'db-switch-wrap' },
      h(
        'button',
        {
          type: 'button',
          role: 'switch',
          className: 'db-switch',
          'data-checked': s[0] ? '' : undefined,
          'data-unchecked': s[0] ? undefined : '',
          'aria-checked': s[0],
          onClick: function () {
            s[1](!s[0]);
          },
        },
        h('span', { className: 'db-switch-thumb', 'data-checked': s[0] ? '' : undefined }),
      ),
      props.label,
    );
  }

  function DropdownMenu(props) {
    return h(
      'div',
      {
        className: 'db-menu',
        role: 'menu',
        style: props.width ? { width: props.width } : undefined,
      },
      props.items.map(function (it, i) {
        if (it.separator) return h('div', { key: i, className: 'db-menu-sep', role: 'separator' });
        if (it.heading) return h('div', { key: i, className: 'db-menu-label' }, it.heading);
        return h(
          'button',
          {
            key: i,
            type: 'button',
            role: it.checked != null ? 'menuitemcheckbox' : 'menuitem',
            'aria-checked': it.checked != null ? !!it.checked : undefined,
            className: 'db-menu-item',
            'data-variant': it.destructive ? 'destructive' : undefined,
            'data-highlighted': it.highlighted ? '' : undefined,
            'data-checked': it.checked ? '' : undefined,
            'data-inset': it.checked != null ? 'true' : undefined,
          },
          it.checked
            ? h('span', { className: 'db-menu-indicator' }, h(Icon, { name: 'check', size: 16 }))
            : null,
          iconOf(it.icon, 16),
          it.label,
          it.shortcut ? h('span', { className: 'db-menu-shortcut' }, it.shortcut) : null,
          it.submenu
            ? h(Icon, { name: 'chevron-right', size: 16, className: 'db-menu-shortcut' })
            : null,
        );
      }),
    );
  }

  function Command(props) {
    return h(
      'div',
      { className: 'db-command' },
      h(
        'div',
        { className: 'db-command-input' },
        h(Icon, { name: 'search' }),
        props.placeholder || 'Type a command or search…',
      ),
      props.groups.map(function (g, gi) {
        return h(
          R.Fragment,
          { key: gi },
          gi > 0 ? h('div', { className: 'db-menu-sep', style: { margin: 0 } }) : null,
          h(
            'div',
            { className: 'db-command-group' },
            h('div', { className: 'db-command-heading' }, g.heading),
            g.items.map(function (it, i) {
              return h(
                'div',
                {
                  key: i,
                  className: 'db-menu-item',
                  'data-highlighted': gi === 0 && i === 0 ? '' : undefined,
                },
                iconOf(it.icon, 16),
                it.label,
                it.shortcut ? h('span', { className: 'db-menu-shortcut' }, it.shortcut) : null,
              );
            }),
          ),
        );
      }),
    );
  }

  function Tooltip(props) {
    return h('span', { className: 'db-tooltip', role: 'tooltip' }, props.children);
  }

  function Dialog(props) {
    return h(
      'div',
      {
        className: 'db-dialog',
        role: props.alert ? 'alertdialog' : 'dialog',
        'aria-labelledby': 'db-dlg-t',
      },
      props.alert
        ? null
        : h(
            'span',
            { className: 'db-dialog-close' },
            h(Button, { variant: 'ghost', size: 'icon-xs', icon: 'x', 'aria-label': 'Close' }),
          ),
      h(
        'div',
        { className: 'db-dialog-header' },
        h('h2', { className: 'db-dialog-title', id: 'db-dlg-t' }, props.title),
        props.description ? h('p', { className: 'db-dialog-desc' }, props.description) : null,
      ),
      props.children,
      h(
        'div',
        { className: 'db-dialog-footer' },
        h(Button, { variant: 'ghost' }, props.cancelLabel || 'Close'),
        h(Button, { variant: props.destructive ? 'destructive' : 'default' }, props.actionLabel),
      ),
    );
  }

  function Sheet(props) {
    return h(
      'div',
      { className: 'db-sheet', role: 'dialog', 'aria-label': props.title },
      h(
        'div',
        { className: 'db-sheet-header' },
        h('h2', { className: 'db-sheet-title' }, props.title),
        h(Button, {
          variant: 'ghost',
          size: 'icon-xs',
          icon: 'maximize-2',
          'aria-label': 'Open as page',
        }),
        h(Button, { size: 'icon-xs', icon: 'x', 'aria-label': 'Close' }),
      ),
      h('div', { className: 'db-sheet-body' }, props.children),
    );
  }

  var TOAST = {
    success: ['circle-check', 'var(--status-completed)'],
    warning: ['triangle-alert', 'var(--priority-medium)'],
    error: ['circle-x', 'var(--destructive)'],
  };
  function Toast(props) {
    var t = props.tone ? TOAST[props.tone] : null;
    return h(
      'div',
      { className: 'db-toast', role: 'status' },
      t ? h(Icon, { name: t[0], color: t[1] }) : null,
      h(
        'div',
        { className: 'db-toast-body' },
        h('div', { className: 'db-toast-title' }, props.title),
        props.description ? h('div', { className: 'db-toast-desc' }, props.description) : null,
      ),
      props.action ? h(Button, { size: 'sm' }, props.action) : null,
    );
  }

  function Card(props) {
    return h(
      'div',
      { className: 'db-card', 'data-slot': 'card', style: props.style },
      h(
        'div',
        { className: 'db-card-header' },
        h('div', { className: 'db-card-title' }, props.title),
        props.description ? h('div', { className: 'db-card-desc' }, props.description) : null,
        props.action ? h('div', { className: 'db-card-action' }, props.action) : null,
      ),
      props.children ? h('div', { className: 'db-card-content' }, props.children) : null,
    );
  }

  function Separator() {
    return h('div', { className: 'db-sep', role: 'separator' });
  }

  function Skeleton(props) {
    return h('div', {
      className: 'db-skeleton',
      style: { width: props.width, height: props.height },
    });
  }

  function Progress(props) {
    return h(
      'div',
      {
        className: 'db-progress',
        role: 'progressbar',
        'aria-valuenow': props.value,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      },
      h('span', { style: { width: props.value + '%', background: props.color } }),
    );
  }

  function Kbd(props) {
    return h('kbd', { className: 'db-kbd' }, props.children);
  }

  function Breadcrumb(props) {
    var items = props.items;
    return h(
      'nav',
      { 'aria-label': 'Breadcrumb' },
      h(
        'ol',
        { className: 'db-crumbs', style: { margin: 0, padding: 0, listStyle: 'none' } },
        items.map(function (it, i) {
          var last = i === items.length - 1;
          return h(
            R.Fragment,
            { key: i },
            h(
              'li',
              {
                className: cx('db-crumb', last && 'db-crumb-page'),
                'aria-current': last ? 'page' : undefined,
              },
              last ? iconOf(props.icon, 14, props.iconColor) : null,
              it,
            ),
            last
              ? null
              : h(
                  'li',
                  { role: 'presentation', 'aria-hidden': true, className: 'db-crumb db-crumb-sep' },
                  h(Icon, { name: 'chevron-right', size: 12 }),
                ),
          );
        }),
      ),
    );
  }

  function Calendar(props) {
    var first = props.firstWeekday == null ? 4 : props.firstWeekday;
    var days = props.days || 31;
    var prevDays = props.prevMonthDays || 30;
    var cells = [];
    for (var i = first - 1; i >= 0; i--) cells.push({ d: prevDays - i, out: true });
    for (var d = 1; d <= days; d++) cells.push({ d: d });
    var n = 1;
    while (cells.length % 7) cells.push({ d: n++, out: true });
    var s = useState(props.selected);
    return h(
      'div',
      { className: 'db-cal' },
      h('div', { className: 'db-cal-head' }, props.title || 'May 2026'),
      h(
        'div',
        { className: 'db-cal-grid', role: 'grid' },
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (w, i) {
          return h('span', { key: 'w' + i, className: 'db-cal-dow' }, w);
        }),
        cells.map(function (c, i) {
          return h(
            'span',
            {
              key: i,
              className: 'db-cal-day',
              role: 'gridcell',
              'data-outside': c.out ? '' : undefined,
              'data-today': !c.out && c.d === props.today ? '' : undefined,
              'data-selected': !c.out && c.d === s[0] ? '' : undefined,
              onClick: c.out
                ? undefined
                : function () {
                    s[1](c.d);
                  },
            },
            c.d,
          );
        }),
      ),
    );
  }

  /* ---------- DevBrain components, built from the base above ---------- */

  function StatusIcon(props) {
    var size = props.size || 16;
    switch (props.status) {
      case 'in-progress':
        return h(Icon, {
          name: 'activity',
          size: size,
          color: 'var(--status-in-progress)',
          label: 'In progress',
        });
      case 'completed':
        return h(FilledCheck, { size: size, color: 'var(--status-completed)' });
      case 'overdue':
        return h(Icon, {
          name: 'flag',
          size: size,
          color: 'var(--status-overdue)',
          label: 'Overdue',
        });
      case 'cancelled':
        return h(Icon, {
          name: 'circle-slash',
          size: size,
          color: 'var(--status-cancelled)',
          label: 'Cancelled',
        });
      default:
        return h(Icon, {
          name: 'circle',
          size: size,
          color: 'var(--status-not-started)',
          label: 'Not started',
        });
    }
  }

  function PriorityIcon(props) {
    var map = {
      high: ['chevrons-up', 'var(--priority-high)', 'High priority'],
      medium: ['equal', 'var(--priority-medium)', 'Medium priority'],
      low: ['chevron-down', 'var(--priority-low)', 'Low priority'],
    }[props.priority || 'low'];
    return h(Icon, {
      name: map[0],
      size: props.size || 16,
      color: map[1],
      strokeWidth: 2.5,
      label: map[2],
    });
  }

  function HealthIcon(props) {
    var size = props.size || 16;
    switch (props.health) {
      case 'on-track':
        return h(Icon, {
          name: 'clock',
          size: size,
          color: 'var(--health-on-track)',
          label: 'On track',
        });
      case 'at-risk':
        return h(Icon, {
          name: 'circle-alert',
          size: size,
          color: 'var(--health-at-risk)',
          label: 'At risk',
        });
      case 'off-track':
        return h(Icon, {
          name: 'circle-x',
          size: size,
          color: 'var(--health-off-track)',
          label: 'Off track',
        });
      case 'completed':
        return h(FilledCheck, { size: size, color: 'var(--health-completed)' });
      default:
        return h(Icon, {
          name: 'circle',
          size: size,
          color: 'var(--health-not-started)',
          label: 'Not started',
        });
    }
  }

  function ProgressRing(props) {
    var size = props.size || 14;
    var stroke = props.stroke || Math.max(2, size / 7);
    var r = (size - stroke) / 2;
    var c = 2 * Math.PI * r;
    var frac = props.total ? props.value / props.total : 0;
    return h(
      'svg',
      {
        className: 'db-icon',
        width: size,
        height: size,
        viewBox: '0 0 ' + size + ' ' + size,
        role: 'img',
        'aria-label': props.value + ' of ' + props.total,
      },
      h('circle', {
        cx: size / 2,
        cy: size / 2,
        r: r,
        fill: 'none',
        stroke: 'var(--input)',
        strokeWidth: stroke,
      }),
      h('circle', {
        cx: size / 2,
        cy: size / 2,
        r: r,
        fill: 'none',
        stroke: props.color || 'var(--status-in-progress)',
        strokeWidth: stroke,
        strokeDasharray: c,
        strokeDashoffset: c * (1 - frac),
        strokeLinecap: 'round',
        transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')',
      }),
    );
  }

  var ENTITY = {
    project: { icon: 'folder' },
    note: { icon: 'file-text' },
    task: { icon: 'activity', color: 'var(--status-in-progress)' },
  };
  function EntityPill(props) {
    var e = ENTITY[props.type] || {};
    return h(
      Badge,
      {
        variant: 'outline',
        asButton: true,
        icon: e.icon,
        iconColor: e.color,
        barColor: props.type === 'event' ? props.color || 'var(--swatch-green)' : undefined,
        prefix: props.prefix,
        muted: props.type !== 'event',
      },
      props.children,
    );
  }

  function PropertyPanel(props) {
    return h(
      Card,
      { title: props.title || 'Properties', style: { maxWidth: 280 } },
      h(
        'div',
        { className: 'db-props' },
        props.fields.map(function (f, i) {
          return h(
            'div',
            { key: i, className: 'db-prop' },
            h('span', { className: 'db-caption' }, f.label),
            h(
              'div',
              { className: 'db-prop-values' },
              f.values.map(function (v, j) {
                return h(R.Fragment, { key: j }, v);
              }),
            ),
          );
        }),
      ),
    );
  }

  function TaskRow(props) {
    var t = props.task;
    return h(
      'div',
      { className: 'db-row', role: 'row', 'data-selected': t.selected ? '' : undefined },
      h(
        'div',
        { className: 'db-row-main' },
        h(Checkbox, { label: 'Select ' + t.title, defaultChecked: t.selected }),
        h(StatusIcon, { status: t.status }),
        t.key ? h('span', { className: 'db-key' }, t.key) : null,
        h(
          'span',
          {
            className: 'db-row-name',
            'data-completed': t.status === 'completed' ? 'true' : undefined,
          },
          t.title,
        ),
        t.parent
          ? h(
              R.Fragment,
              null,
              h(Icon, { name: 'corner-down-right', size: 14, className: 'db-subtask-arrow' }),
              h(EntityPill, { type: 'task' }, t.parent),
            )
          : null,
        t.subtasks
          ? h(
              Badge,
              {
                variant: 'outline',
                icon: h(ProgressRing, { value: t.subtasks[0], total: t.subtasks[1], size: 12 }),
              },
              t.subtasks[0] + '/' + t.subtasks[1],
            )
          : null,
      ),
      h(
        'div',
        { className: 'db-row-side' },
        t.project ? h(EntityPill, { type: 'project' }, t.project) : null,
        t.event ? h(EntityPill, { type: 'event', color: t.eventColor }, t.event) : null,
        h(PriorityIcon, { priority: t.priority }),
        h('span', { className: 'db-date', 'data-tone': t.dateTone }, t.date || ''),
      ),
    );
  }

  function GroupHeading(props) {
    return h(
      'div',
      { className: 'db-group', role: 'heading', 'aria-level': 3 },
      iconOf(props.icon, 16, props.iconColor),
      props.label,
      props.count != null ? h('span', { className: 'db-group-count' }, props.count) : null,
      props.hint ? h('span', { className: 'db-group-hint' }, props.hint) : null,
    );
  }

  function EventRow(props) {
    var e = props.event;
    return h(
      'div',
      { className: 'db-row', role: 'row' },
      h(
        'div',
        { className: 'db-row-main' },
        h('span', {
          className: 'db-bar',
          style: { background: e.color || 'var(--swatch-green)', height: 20, alignSelf: 'center' },
        }),
        h('span', { className: 'db-row-name' }, e.title),
        h('span', { className: 'db-row-time' }, e.time + (e.repeats ? ' · ' + e.repeats : '')),
      ),
      h(
        'div',
        { className: 'db-row-side' },
        e.meeting ? h(Button, { variant: 'outline', size: 'xs', icon: 'video' }, 'Join') : null,
        h('span', { className: 'db-date', 'data-tone': e.tone }, e.relative),
      ),
    );
  }

  function ScheduleCard(props) {
    return h(
      'div',
      { className: 'db-card', 'data-size': 'compact' },
      h('span', {
        className: 'db-bar',
        style: { background: props.color || 'var(--swatch-green)' },
      }),
      h(
        'div',
        { className: 'db-card-body' },
        h('div', { className: 'db-card-name' }, props.title),
        h(
          'div',
          { className: 'db-card-meta' },
          props.soon ? h('b', null, props.soon) : props.duration,
          ' · ',
          props.time,
        ),
      ),
      props.join ? h(Button, { variant: 'outline', size: 'xs' }, 'Join') : null,
    );
  }

  function NoteCard(props) {
    return h(
      'div',
      { className: 'db-card', 'data-size': 'compact', 'data-layout': 'stack' },
      h(
        'div',
        { className: 'db-card-top' },
        h(Icon, { name: 'file-text' }),
        h('span', null, props.updated),
      ),
      h('div', { className: 'db-card-name' }, props.title),
      h('div', { className: 'db-card-meta db-clamp-2' }, props.preview),
    );
  }

  function WorkspaceTile(props) {
    var size = props.size || 20;
    return h(
      'span',
      {
        className: 'db-tile',
        style: {
          width: size,
          height: size,
          background: props.color
            ? 'var(--swatch-' + props.color + '-tile)'
            : 'var(--sidebar-primary)',
          color: props.color ? undefined : 'var(--sidebar-primary-foreground)',
          fontSize: Math.round(size * 0.6) + 'px',
          lineHeight: 1,
          borderRadius: size > 40 ? 'var(--radius-xl)' : 'var(--radius-sm)',
        },
      },
      props.letter,
    );
  }

  var SWATCHES = ['red', 'amber', 'green', 'blue', 'indigo', 'pink'];
  function SwatchPicker(props) {
    var s = useState(props.defaultValue || 'green');
    return h(
      'div',
      { className: 'db-swatches', role: 'radiogroup', 'aria-label': 'Colour' },
      SWATCHES.map(function (n) {
        return h(
          'button',
          {
            key: n,
            type: 'button',
            role: 'radio',
            className: 'db-swatch',
            'data-checked': s[0] === n ? '' : undefined,
            'aria-checked': s[0] === n,
            'aria-label': n,
            style: { background: 'var(--swatch-' + n + ')' },
            onClick: function () {
              s[1](n);
            },
          },
          s[0] === n ? h(Icon, { name: 'check', size: 14, strokeWidth: 3 }) : null,
        );
      }),
    );
  }

  function Sidebar(props) {
    var s = useState(props.active || 'Tasks');
    var nav = [
      ['Home', 'house'],
      ['Tasks', 'circle-check'],
      ['Projects', 'folder'],
      ['Notes', 'file-text'],
      ['Calendar', 'calendar'],
      ['Integrations', 'zap'],
    ];
    return h(
      'nav',
      { className: 'db-sidebar', 'aria-label': 'Main' },
      h(
        'div',
        { className: 'db-sidebar-header' },
        h(WorkspaceTile, {
          letter: (props.workspace || 'S')[0],
          color: props.workspaceColor || 'green',
        }),
        props.workspace || 'SurveyMonkey',
        h(Icon, { name: 'chevron-down', size: 12, color: 'var(--muted-foreground)' }),
        h(
          'span',
          { className: 'db-sidebar-header-actions' },
          h(Icon, { name: 'search', size: 12, color: 'var(--muted-foreground)' }),
          h(Button, { size: 'icon-xs', icon: 'square-pen', 'aria-label': 'New' }),
        ),
      ),
      h(
        'div',
        { className: 'db-sidebar-menu' },
        nav.map(function (n) {
          return h(
            'button',
            {
              key: n[0],
              type: 'button',
              className: 'db-sidebar-btn',
              'data-active': s[0] === n[0] ? '' : undefined,
              'aria-current': s[0] === n[0] ? 'page' : undefined,
              onClick: function () {
                s[1](n[0]);
              },
            },
            h(Icon, { name: n[1] }),
            h('span', null, n[0]),
          );
        }),
      ),
      [
        ['Recents', props.recents],
        ['Favorites', props.favorites],
      ].map(function (g) {
        if (!g[1]) return null;
        return h(
          'div',
          { key: g[0], className: 'db-sidebar-group' },
          h('div', { className: 'db-sidebar-group-label' }, g[0]),
          h(
            'div',
            { className: 'db-sidebar-menu' },
            g[1].map(function (r, i) {
              return h(
                'button',
                { key: i, type: 'button', className: 'db-sidebar-btn' },
                r.bar
                  ? h('span', { className: 'db-bar', style: { background: r.bar } })
                  : h(Icon, { name: r.icon, color: r.color }),
                h('span', null, r.label),
              );
            }),
          ),
        );
      }),
    );
  }

  function SettingsGroup(props) {
    return h(
      'div',
      { className: 'db-card', style: { padding: 0, gap: 0 } },
      props.rows.map(function (r, i) {
        return h(
          'div',
          { key: i, className: 'db-settings-row' },
          h(
            'div',
            { className: 'db-settings-text' },
            h('div', { className: 'db-label' }, r.label),
            r.description ? h('div', { className: 'db-dialog-desc' }, r.description) : null,
          ),
          r.value ? h('span', { className: 'db-settings-value' }, r.value) : null,
          r.control,
        );
      }),
    );
  }

  function EventBlock(props) {
    return h(
      'div',
      { className: 'db-event', style: props.height ? { height: props.height } : undefined },
      h('span', {
        className: 'db-bar',
        style: { background: props.color || 'var(--swatch-green)' },
      }),
      h(
        'div',
        null,
        h('div', null, props.title),
        h(
          'div',
          { className: 'db-event-time' },
          props.time,
          props.meeting ? h(Icon, { name: 'video', size: 12 }) : null,
        ),
      ),
    );
  }

  window.DevBrain = Object.assign(window.DevBrain || {}, {
    Icon: Icon,
    Button: Button,
    ButtonGroup: ButtonGroup,
    Badge: Badge,
    ToggleGroup: ToggleGroup,
    Tabs: Tabs,
    Input: Input,
    Textarea: Textarea,
    Field: Field,
    Checkbox: Checkbox,
    Switch: Switch,
    DropdownMenu: DropdownMenu,
    Command: Command,
    Tooltip: Tooltip,
    Dialog: Dialog,
    Sheet: Sheet,
    Toast: Toast,
    Card: Card,
    Separator: Separator,
    Skeleton: Skeleton,
    Progress: Progress,
    Kbd: Kbd,
    Breadcrumb: Breadcrumb,
    Sidebar: Sidebar,
    Calendar: Calendar,
    StatusIcon: StatusIcon,
    PriorityIcon: PriorityIcon,
    HealthIcon: HealthIcon,
    ProgressRing: ProgressRing,
    EntityPill: EntityPill,
    PropertyPanel: PropertyPanel,
    TaskRow: TaskRow,
    GroupHeading: GroupHeading,
    EventRow: EventRow,
    ScheduleCard: ScheduleCard,
    NoteCard: NoteCard,
    WorkspaceTile: WorkspaceTile,
    SwatchPicker: SwatchPicker,
    SettingsGroup: SettingsGroup,
    EventBlock: EventBlock,
  });
})();

/* DevBrain Nova Lists: the quiet list behaviours on DevBrain Nova.
   Replaces TaskRow, GroupHeading and Button (adds `value`); adds StatusMenu, TaskList,
   SelectionBar, BoardColumn and BoardCard. Writes into the namespace it is given. */
(function (NS) {
  var R = window.React;
  var h = R.createElement;
  var F = R.Fragment;
  var useState = R.useState;
  var useEffect = R.useEffect;
  var useRef = R.useRef;
  var Icon = NS.Icon;
  var BaseButton = NS.Button;

  function cx() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  /* Button: Nova's button; `value` shows the current choice after the label ("Filter  Assigned to me"). */
  function Button(props) {
    if (props.value == null) return h(BaseButton, props);
    return h(
      BaseButton,
      Object.assign({}, props, {
        value: undefined,
        className: cx('db-btn-has-value', props.className),
      }),
      h('span', { className: 'db-btn-label' }, props.children),
      h('span', { className: 'db-btn-value' }, props.value),
    );
  }

  /* EntityPill: the chip every relation uses (rows, the properties card, document headers).
     A project's folder icon takes the project's colour; an event shows its calendar's bar. */
  var ENTITY = {
    project: { icon: 'folder' },
    note: { icon: 'file-text' },
    task: { icon: 'activity', color: 'var(--status-in-progress)' },
  };
  function EntityPill(props) {
    var e = ENTITY[props.type] || {};
    var ev = props.type === 'event';
    return h(
      NS.Badge,
      {
        variant: 'outline',
        asButton: true,
        className:
          props.type === 'project' && props.color ? 'db-entity db-entity-project' : 'db-entity',
        icon: ev ? undefined : e.icon,
        iconColor: props.type === 'project' ? props.color || e.color : e.color,
        barColor: ev ? props.color || 'var(--swatch-green)' : undefined,
        prefix: props.prefix,
        muted: !ev,
      },
      props.children,
    );
  }

  var STATUS_ITEMS = [
    ['not-started', 'Not started', '1'],
    ['in-progress', 'In progress', '2'],
    ['completed', 'Completed', '3'],
  ];

  /* StatusMenu: the menu the row's status icon opens. 1, 2, 3 pick; the current status is ticked. */
  function StatusMenu(props) {
    return h(
      'div',
      {
        className: cx('db-menu dbl-status-menu', props.floating === false && 'dbl-static'),
        role: 'menu',
        'aria-label': 'Status',
      },
      h('div', { className: 'db-menu-label' }, 'Status'),
      STATUS_ITEMS.map(function (it) {
        var cur = props.status === it[0] || (props.status === 'overdue' && it[0] === 'not-started');
        return h(
          'button',
          {
            key: it[0],
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': cur,
            className: 'db-menu-item',
            onClick: function (e) {
              e.stopPropagation();
              if (props.onPick) props.onPick(it[0]);
            },
          },
          h('span', { className: 'dbl-menu-icon' }, h(NS.StatusIcon, { status: it[0] })),
          it[1],
          cur
            ? h('span', { className: 'dbl-tick' }, h(Icon, { name: 'check', size: 16 }))
            : h('span', { className: 'db-menu-shortcut' }, it[2]),
        );
      }),
    );
  }

  /* TaskRow: strokeless row. Leading strip (checkbox on hover, focus or while selecting), the
     status button, the title first (key and subtasks after it), entity pills, priority and date
     on the right. Status is uncontrolled unless `status` is passed. */
  function TaskRow(props) {
    var t = props.task;
    var st = useState(t.status);
    var status = props.status || st[0];
    var mo = useState(!!props.menuOpen);
    var open = mo[0];
    var ref = useRef(null);
    useEffect(
      function () {
        if (!open) return undefined;
        function close(e) {
          if (ref.current && !ref.current.contains(e.target)) mo[1](false);
        }
        function key(e) {
          var i = ['1', '2', '3'].indexOf(e.key);
          if (i > -1) {
            e.preventDefault();
            pick(STATUS_ITEMS[i][0]);
          } else if (e.key === 'Escape') mo[1](false);
        }
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', key);
        return function () {
          document.removeEventListener('pointerdown', close);
          document.removeEventListener('keydown', key);
        };
      },
      [open],
    );
    function pick(s) {
      st[1](s);
      mo[1](false);
      if (props.onStatusChange) props.onStatusChange(s);
    }
    var shown =
      status === 'completed'
        ? 'completed'
        : t.dateTone === 'overdue' && status !== 'in-progress'
          ? 'overdue'
          : status;
    var selected = props.selected != null ? props.selected : !!t.selected;
    return h(
      'div',
      {
        ref: ref,
        className: cx('dbl-row', props.subtask && 'dbl-sub'),
        role: 'row',
        tabIndex: 0,
        'aria-selected': selected,
        'data-selected': selected ? '' : undefined,
        'data-join-prev': props.joinPrev ? '' : undefined,
        'data-join-next': props.joinNext ? '' : undefined,
        'data-state': props.state,
        'data-completed': status === 'completed' ? '' : undefined,
        'data-menu-open': open ? '' : undefined,
        onKeyDown: function (e) {
          if (e.target !== e.currentTarget) return;
          if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            mo[1](true);
          } else if ((e.key === 'x' || e.key === 'X') && props.onSelect) {
            e.preventDefault();
            props.onSelect();
          }
        },
      },
      h(
        'button',
        {
          type: 'button',
          role: 'checkbox',
          className: 'db-check dbl-check',
          'aria-checked': selected,
          'aria-label': 'Select ' + t.title,
          'data-checked': selected ? '' : undefined,
          tabIndex: -1,
          onClick: function (e) {
            e.stopPropagation();
            if (props.onSelect) props.onSelect();
          },
        },
        selected ? h(Icon, { name: 'check', size: 14, strokeWidth: 3 }) : null,
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'dbl-status',
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-label': 'Status: ' + shown.replace('-', ' '),
          tabIndex: -1,
          onClick: function (e) {
            e.stopPropagation();
            mo[1](!open);
          },
        },
        h(NS.StatusIcon, { status: shown }),
      ),
      h(
        'div',
        { className: 'dbl-title' },
        h('span', { className: 'dbl-name' }, t.title),
        t.key ? h('span', { className: 'db-key' }, t.key) : null,
        t.subtasks
          ? h(
              'span',
              { className: 'dbl-subs' },
              h(Icon, { name: 'corner-down-right', size: 12 }),
              t.subtasks[0] + '/' + t.subtasks[1],
            )
          : null,
      ),
      h(
        'div',
        { className: 'dbl-side' },
        t.project ? h(NS.EntityPill, { type: 'project', color: t.projectColor }, t.project) : null,
        t.event ? h(NS.EntityPill, { type: 'event', color: t.eventColor }, t.event) : null,
        t.note ? h(NS.EntityPill, { type: 'note' }, t.note) : null,
        h(
          'span',
          { className: 'dbl-pri' },
          status === 'completed' ? null : h(NS.PriorityIcon, { priority: t.priority }),
        ),
        h(
          'span',
          { className: 'db-date', 'data-tone': status === 'completed' ? undefined : t.dateTone },
          t.date || '',
        ),
      ),
      open ? h(StatusMenu, { status: status, onPick: pick }) : null,
    );
  }

  /* SelectionBar: floats over the bottom of a list while rows are selected. */
  function SelectionBar(props) {
    return h(
      'div',
      {
        className: cx('dbl-selbar', props.floating === false && 'dbl-static'),
        role: 'toolbar',
        'aria-label': 'Selected tasks',
      },
      h('span', { className: 'dbl-selcount' }, props.count + ' selected'),
      h('span', { className: 'dbl-selsep' }),
      h(BaseButton, { variant: 'ghost', size: 'sm', icon: 'circle' }, 'Status'),
      h(BaseButton, { variant: 'ghost', size: 'sm', icon: 'chevrons-up' }, 'Priority'),
      h(BaseButton, { variant: 'ghost', size: 'sm', icon: 'calendar' }, 'Due date'),
      h(BaseButton, { variant: 'ghost', size: 'sm', icon: 'folder' }, 'Move'),
      h(BaseButton, {
        variant: 'ghost',
        size: 'icon-sm',
        icon: 'ellipsis',
        'aria-label': 'More actions',
      }),
      h(BaseButton, {
        variant: 'ghost',
        size: 'icon-sm',
        icon: 'x',
        'aria-label': 'Clear selection',
        onClick: props.onClear,
      }),
    );
  }

  /* TaskList: rows with selection. Neighbouring selected rows join into one block; while
     anything is selected every row shows its checkbox and the SelectionBar floats below. */
  function TaskList(props) {
    var init = {};
    (props.defaultSelected || []).forEach(function (i) {
      init[i] = true;
    });
    props.tasks.forEach(function (t, i) {
      if (t.selected) init[i] = true;
    });
    var s = useState(init);
    var sel = s[0];
    var n = Object.keys(sel).filter(function (k) {
      return sel[k];
    }).length;
    function toggle(i) {
      s[1](function (x) {
        var y = Object.assign({}, x);
        y[i] = !y[i];
        return y;
      });
    }
    return h(
      'div',
      {
        className: 'dbl-list',
        role: 'grid',
        'aria-multiselectable': true,
        'data-selecting': n ? '' : undefined,
        onKeyDown: function (e) {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          var rows = Array.prototype.slice.call(e.currentTarget.querySelectorAll('.dbl-row'));
          var i = rows.indexOf(document.activeElement);
          if (i < 0) return;
          e.preventDefault();
          var next =
            rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
          if (next) next.focus();
        },
      },
      props.tasks.map(function (t, i) {
        return h(TaskRow, {
          key: t.key || i,
          task: t,
          selected: !!sel[i],
          joinPrev: !!(sel[i] && sel[i - 1]),
          joinNext: !!(sel[i] && sel[i + 1]),
          state: (props.states || {})[i],
          menuOpen: props.menuOpenAt === i,
          subtask: props.subtasks,
          onSelect: function () {
            toggle(i);
          },
        });
      }),
      n && props.selectionBar !== false
        ? h(SelectionBar, {
            count: n,
            floating: props.floatingBar,
            onClear: function () {
              s[1]({});
            },
          })
        : null,
    );
  }

  /* GroupHeading: a group of the grouped list. No band: space above, a tile, the title and a
     subtitle, "+ Add task", done/total and a progress bar. */
  function GroupHeading(props) {
    var total = props.total != null ? props.total : props.count;
    var done = props.done || 0;
    return h(
      'div',
      {
        className: 'dbl-group',
        role: 'heading',
        'aria-level': 3,
        'data-collapsed': props.collapsed ? '' : undefined,
      },
      h(Icon, {
        name: props.collapsed ? 'chevron-right' : 'chevron-down',
        size: 14,
        className: 'dbl-chev',
      }),
      h(
        'span',
        { className: 'dbl-tile' },
        props.bar
          ? h('span', { className: 'db-bar', style: { background: props.bar, height: 14 } })
          : h(Icon, { name: props.icon || 'circle', size: 16, color: props.iconColor }),
      ),
      h(
        'div',
        { className: 'dbl-gtitle' },
        h('span', { className: 'dbl-glabel' }, props.label),
        props.subtitle ? h('span', { className: 'dbl-gsub' }, props.subtitle) : null,
      ),
      props.collapsed ? h('span') : h(BaseButton, { size: 'xs', icon: 'plus' }, 'Add task'),
      total != null
        ? h('span', { className: 'dbl-gcount' }, (props.done != null ? done + '/' : '') + total)
        : h('span'),
      total
        ? h(
            'span',
            { className: 'dbl-gbar' },
            h('span', { style: { width: Math.round((100 * done) / total) + '%' } }),
          )
        : h('span'),
    );
  }

  /* BoardColumn: a status column on the board (Nova's filled panel). */
  function BoardColumn(props) {
    return h(
      'section',
      { className: 'dbl-col', 'aria-label': props.name },
      h(
        'div',
        { className: 'dbl-colhead' },
        h(NS.StatusIcon, { status: props.status }),
        props.name,
        h(
          'span',
          { className: 'dbl-colcount' },
          props.count != null ? props.count : R.Children.count(props.children),
        ),
        h(BaseButton, {
          variant: 'ghost',
          size: 'icon-xs',
          icon: 'plus',
          'aria-label': 'Add task to ' + props.name,
        }),
      ),
      h(
        'div',
        { className: 'dbl-cards' },
        props.children,
        props.add === false
          ? null
          : h(
              'button',
              { type: 'button', className: 'dbl-slot' },
              h(Icon, { name: 'plus', size: 14 }),
              'Add task',
            ),
      ),
    );
  }

  /* BoardCard: the link as a quiet line, the title, then one line of priority, subtasks,
     project and date. Completed cards dim. */
  function BoardCard(props) {
    var t = props.task;
    var done = t.status === 'completed';
    var link = t.event
      ? h(
          'div',
          { className: 'dbl-clink' },
          h('span', {
            className: 'db-bar',
            style: { background: t.eventColor || 'var(--swatch-green)', height: 12 },
          }),
          h('span', null, t.event),
        )
      : t.note
        ? h(
            'div',
            { className: 'dbl-clink' },
            h(Icon, { name: 'file-text', size: 12 }),
            h('span', null, t.note),
          )
        : null;
    return h(
      'div',
      {
        className: 'dbl-card',
        tabIndex: 0,
        'data-state': props.state,
        'data-completed': done ? '' : undefined,
      },
      link,
      h('div', { className: 'dbl-ctitle' }, t.title),
      h(
        'div',
        { className: 'dbl-cmeta' },
        done ? null : h(NS.PriorityIcon, { priority: t.priority }),
        t.subtasks
          ? h(
              'span',
              { className: 'dbl-subs' },
              h(Icon, { name: 'corner-down-right', size: 12 }),
              t.subtasks[0] + '/' + t.subtasks[1],
            )
          : null,
        t.project
          ? h(
              'span',
              { className: 'dbl-cproj' },
              h(Icon, { name: 'folder', size: 12, color: t.projectColor }),
              h('span', null, t.project),
            )
          : null,
        h(
          'span',
          { className: 'db-date', 'data-tone': done ? undefined : t.dateTone },
          t.date || '',
        ),
      ),
    );
  }

  Object.assign(NS, {
    Button: Button,
    EntityPill: EntityPill,
    StatusMenu: StatusMenu,
    TaskRow: TaskRow,
    TaskList: TaskList,
    SelectionBar: SelectionBar,
    GroupHeading: GroupHeading,
    BoardColumn: BoardColumn,
    BoardCard: BoardCard,
  });
})(window.__DBL_TARGET__ || window.DevBrain);
