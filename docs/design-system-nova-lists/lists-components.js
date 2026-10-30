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
        t.project ? h(NS.EntityPill, { type: 'project' }, t.project) : null,
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
              h(Icon, { name: 'folder', size: 12 }),
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
    StatusMenu: StatusMenu,
    TaskRow: TaskRow,
    TaskList: TaskList,
    SelectionBar: SelectionBar,
    GroupHeading: GroupHeading,
    BoardColumn: BoardColumn,
    BoardCard: BoardCard,
  });
})(window.__DBL_TARGET__ || window.DevBrain);
