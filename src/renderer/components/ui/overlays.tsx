import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { ContextMenu } from '@base-ui/react/context-menu';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Drawer } from '@base-ui/react/drawer';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { Autocomplete } from '@base-ui/react/autocomplete';
import { PreviewCard } from '@base-ui/react/preview-card';
import { Toast as BaseToast } from '@base-ui/react/toast';
import { Button, Icon, Kbd, Progress, StatusIcon, ColorBar, glyph } from './primitives';
import { ui, colorValue } from './styles';
import type { TaskStatus } from './types';

export interface MenuItem {
  id?: string;
  heading?: string;
  separator?: boolean;
  icon?: ReactNode;
  label?: string;
  shortcut?: string;
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  items?: MenuItem[];
  onClick?: () => void;
  onCheckedChange?: (checked: boolean) => void;
}
function MenuItems({ items }: { items: MenuItem[] }) {
  return (
    <>
      {items.map((item, index) => {
        const key = item.id ?? `${item.label ?? item.heading ?? 'separator'}-${index}`;
        const content = (
          <>
            {glyph(item.icon)}
            <span>{item.label}</span>
            {item.shortcut && <span className={ui('db-menu-shortcut')}>{item.shortcut}</span>}
          </>
        );
        if (item.separator) return <Menu.Separator key={key} className={ui('db-menu-sep')} />;
        if (item.heading)
          return (
            <Menu.Group key={key}>
              <Menu.GroupLabel className={ui('db-menu-label')}>{item.heading}</Menu.GroupLabel>
              {item.items && <MenuItems items={item.items} />}
            </Menu.Group>
          );
        if (item.items)
          return (
            <Menu.SubmenuRoot key={key}>
              <Menu.SubmenuTrigger disabled={item.disabled} className={ui('db-menu-item')}>
                {content}
                <Icon name="chevron-right" size={12} />
              </Menu.SubmenuTrigger>
              <Menu.Portal>
                <Menu.Positioner sideOffset={4} className={ui('positioner')}>
                  <Menu.Popup className={ui('db-menu', 'popup')}>
                    <MenuItems items={item.items} />
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
          );
        if (item.checked !== undefined)
          return (
            <Menu.CheckboxItem
              key={key}
              disabled={item.disabled}
              checked={item.checked}
              onCheckedChange={item.onCheckedChange}
              className={ui('db-menu-item')}
            >
              <Menu.CheckboxItemIndicator>
                <Icon name="check" size={12} />
              </Menu.CheckboxItemIndicator>
              {content}
            </Menu.CheckboxItem>
          );
        return (
          <Menu.Item
            key={key}
            disabled={item.disabled}
            onClick={item.onClick}
            className={ui('db-menu-item')}
            data-variant={item.destructive ? 'destructive' : undefined}
          >
            {content}
          </Menu.Item>
        );
      })}
    </>
  );
}
export interface DropdownMenuProps {
  items: MenuItem[];
  trigger?: ReactElement;
  width?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
}
export function DropdownMenu({
  items,
  trigger = <Button size="icon" icon="ellipsis" aria-label="More actions" />,
  width,
  open,
  defaultOpen,
  onOpenChange,
  label = 'Actions',
}: DropdownMenuProps) {
  return (
    <Menu.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="start" className={ui('positioner')}>
          <Menu.Popup aria-label={label} className={ui('db-menu', 'popup')} style={{ width }}>
            <MenuItems items={items} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
export function RightClickMenu({ items, children }: { items: MenuItem[]; children: ReactNode }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className={ui('positioner')}>
          <ContextMenu.Popup className={ui('db-menu', 'popup')}>
            <MenuItems items={items} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
export function Tooltip({
  children,
  content,
  delay = 400,
}: {
  children: ReactElement;
  content: ReactNode;
  delay?: number;
}) {
  return (
    <BaseTooltip.Provider delay={delay}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger render={children} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner sideOffset={4} className={ui('positioner')}>
            <BaseTooltip.Popup className={ui('db-tooltip', 'popup')}>{content}</BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}
export interface DialogProps {
  title: string;
  description?: string;
  actionLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  alert?: boolean;
  children?: ReactNode;
  trigger?: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: () => void | Promise<void>;
  actionDisabled?: boolean;
  width?: number;
}
export function Dialog({
  title,
  description,
  actionLabel,
  cancelLabel = 'Cancel',
  destructive,
  alert = false,
  children,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  onAction,
  actionDisabled,
  width,
}: DialogProps) {
  const [internal, setInternal] = useState(defaultOpen ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const Parts = alert ? AlertDialog : BaseDialog;
  const changeOpen = (next: boolean) => {
    if (pending && !next) return;
    setInternal(next);
    setError(undefined);
    onOpenChange?.(next);
  };
  async function act() {
    setPending(true);
    setError(undefined);
    try {
      await onAction?.();
      setInternal(false);
      onOpenChange?.(false);
    } catch {
      setError('The action could not be completed. Please try again.');
    } finally {
      setPending(false);
    }
  }
  return (
    <Parts.Root open={open ?? internal} onOpenChange={changeOpen}>
      {trigger && <Parts.Trigger render={trigger} />}
      <Parts.Portal>
        <Parts.Backdrop className={ui('backdrop')} />
        <Parts.Popup className={ui('db-dialog', 'dialog-popup')} style={{ width }}>
          <header className={ui('db-dialog-header')}>
            <Parts.Title className={ui('db-dialog-title')}>{title}</Parts.Title>
            {description && (
              <Parts.Description className={ui('db-dialog-desc')}>{description}</Parts.Description>
            )}
          </header>
          {!alert && (
            <Parts.Close
              render={<Button variant="ghost" size="icon-xs" aria-label="Close dialog" icon="x" />}
              className={ui('db-dialog-close')}
            />
          )}
          {children && <div className={ui('dialog-body')}>{children}</div>}
          {error && (
            <p role="alert" className={ui('db-field-error')}>
              {error}
            </p>
          )}
          <footer className={ui('db-dialog-footer')}>
            <Parts.Close disabled={pending} render={<Button variant="ghost" />}>
              {cancelLabel}
            </Parts.Close>
            {actionLabel && (
              <Button
                variant={destructive ? 'destructive' : 'default'}
                disabled={pending || actionDisabled}
                onClick={() => void act()}
              >
                {pending ? 'Working…' : actionLabel}
              </Button>
            )}
          </footer>
        </Parts.Popup>
      </Parts.Portal>
    </Parts.Root>
  );
}
const subscribeCompact = (callback: () => void) => {
  const media = window.matchMedia('(max-width: 1079px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
};
export function useCompact() {
  return useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia('(max-width: 1079px)').matches,
    () => false,
  );
}
export interface SheetProps {
  title: string;
  description?: string;
  children?: ReactNode;
  overlay?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  onOpenAsPage?: () => void;
  width?: number;
}
export function Sheet({
  title,
  description,
  children,
  overlay,
  open,
  defaultOpen = false,
  onOpenChange,
  trigger,
  onOpenAsPage,
  width,
}: SheetProps) {
  const compact = useCompact();
  const floating = overlay ?? compact;
  const [internal, setInternal] = useState(defaultOpen);
  const isOpen = open ?? internal;
  const change = (next: boolean) => {
    setInternal(next);
    onOpenChange?.(next);
  };
  const controls = (
    <>
      {onOpenAsPage && (
        <Button
          variant="ghost"
          size="icon-xs"
          icon="external-link"
          aria-label="Open as page"
          onClick={onOpenAsPage}
        />
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        icon="x"
        aria-label="Close panel"
        onClick={() => change(false)}
      />
    </>
  );
  if (!floating)
    return (
      <>
        {trigger && <span onClick={() => change(true)}>{trigger}</span>}
        {isOpen && (
          <aside
            aria-label={title}
            className={ui('db-sheet', 'docked-sheet')}
            style={{ width }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') change(false);
            }}
          >
            <header className={ui('db-sheet-header')}>
              <h2 className={ui('db-sheet-title')}>{title}</h2>
              {controls}
            </header>
            {description && <p className={ui('db-dialog-desc')}>{description}</p>}
            <div className={ui('db-sheet-body')}>{children}</div>
          </aside>
        )}
      </>
    );
  return (
    <Drawer.Root open={isOpen} onOpenChange={change} swipeDirection="right">
      {trigger && <Drawer.Trigger render={trigger} />}
      <Drawer.Portal>
        <Drawer.Backdrop className={ui('backdrop')} />
        <Drawer.Popup className={ui('db-sheet', 'floating-sheet')} style={{ width }}>
          <header className={ui('db-sheet-header')}>
            <Drawer.Title className={ui('db-sheet-title')}>{title}</Drawer.Title>
            {controls}
          </header>
          {description && (
            <Drawer.Description className={ui('db-dialog-desc')}>{description}</Drawer.Description>
          )}
          <div className={ui('db-sheet-body')}>{children}</div>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
export interface CommandItem {
  id?: string;
  icon?: ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect?: () => void;
}
export interface CommandProps {
  placeholder?: string;
  label?: string;
  groups: { heading: string; items: CommandItem[] }[];
  onSelect?: (item: CommandItem) => void;
  emptyMessage?: string;
}
export function Command({
  placeholder = 'Search…',
  label = 'Search commands',
  groups,
  onSelect,
  emptyMessage = 'No results found.',
}: CommandProps) {
  const [query, setQuery] = useState('');
  const filtered = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    }))
    .filter((group) => group.items.length);
  return (
    <div className={ui('db-command')}>
      <Autocomplete.Root
        items={filtered}
        inline
        open
        autoHighlight="always"
        value={query}
        onValueChange={setQuery}
        filter={null}
        itemToStringValue={(item: CommandItem) => item.label}
      >
        <Autocomplete.Input
          aria-label={label}
          placeholder={placeholder}
          className={ui('db-command-input')}
        />
        <Autocomplete.List className={ui('command-list')}>
          {filtered.map((group) => (
            <Autocomplete.Group
              key={group.heading}
              items={group.items}
              className={ui('db-command-group')}
            >
              <Autocomplete.GroupLabel className={ui('db-command-heading')}>
                {group.heading}
              </Autocomplete.GroupLabel>
              {group.items.map((item) => (
                <Autocomplete.Item
                  key={item.id ?? item.label}
                  value={item}
                  disabled={item.disabled}
                  onClick={() => {
                    item.onSelect?.();
                    onSelect?.(item);
                  }}
                  className={ui('db-menu-item')}
                >
                  {glyph(item.icon)}
                  <span>{item.label}</span>
                  {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                </Autocomplete.Item>
              ))}
            </Autocomplete.Group>
          ))}
        </Autocomplete.List>
        {!filtered.length && <p className={ui('empty-message')}>{emptyMessage}</p>}
      </Autocomplete.Root>
    </div>
  );
}
export interface EntityHoverCardProps {
  trigger: ReactElement;
  type: 'project' | 'event' | 'note' | 'task' | 'source';
  title: string;
  color?: string;
  status?: TaskStatus;
  pills?: ReactNode;
  meta?: ReactNode[];
  preview?: string;
  progress?: { value: number; label: string };
  actions?: ReactNode;
}
export function EntityHoverCard({
  trigger,
  type,
  title,
  color,
  status = 'not-started',
  pills,
  meta,
  preview,
  progress,
  actions,
}: EntityHoverCardProps) {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger render={trigger} delay={400} closeDelay={200} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={4} className={ui('positioner')}>
          <PreviewCard.Popup className={ui('db-popover', 'db-hovercard', 'popup')}>
            <div className={ui('db-hovercard-head')}>
              {type === 'task' ? (
                <StatusIcon status={status} />
              ) : type === 'event' ? (
                <ColorBar color={color} />
              ) : (
                <Icon
                  name={{ project: 'folder', note: 'file-text', source: 'external-link' }[type]}
                  color={colorValue(color)}
                />
              )}
              <span className={ui('db-hovercard-title')}>{title}</span>
            </div>
            {pills && <div className={ui('db-hovercard-pills')}>{pills}</div>}
            {meta?.map((line, i) => (
              <div key={i} className={ui('db-hovercard-meta')}>
                {line}
              </div>
            ))}
            {preview && <p className={ui('db-hovercard-preview')}>{preview}</p>}
            {progress && (
              <div className={ui('db-hovercard-progress')}>
                <Progress value={progress.value} label={progress.label} />
                <span className={ui('db-hovercard-meta')}>{progress.label}</span>
              </div>
            )}
            {actions && <div className={ui('db-hovercard-actions')}>{actions}</div>}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
export const useToast = BaseToast.useToastManager;
export interface ToastProps {
  tone?: 'success' | 'warning' | 'error';
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
  onClose?: () => void;
}
export function Toast({
  tone = 'success',
  title,
  description,
  action,
  onAction,
  onClose,
}: ToastProps) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={ui('db-toast')} data-type={tone}>
      <Icon
        name={{ success: 'circle-check', warning: 'triangle-alert', error: 'circle-x' }[tone]}
        color={`var(--${{ success: 'status-completed', warning: 'priority-medium', error: 'destructive' }[tone]})`}
      />
      <div className={ui('db-toast-body')}>
        <div className={ui('db-toast-title')}>{title}</div>
        {description && <p className={ui('db-toast-desc')}>{description}</p>}
      </div>
      {action && (
        <Button size="xs" onClick={onAction}>
          {action}
        </Button>
      )}
      {onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          icon="x"
          aria-label="Dismiss notification"
          onClick={onClose}
        />
      )}
    </div>
  );
}
function ToastViewport() {
  const manager = useToast();
  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className={ui('toast-viewport')}>
        {manager.toasts.map((toast) => (
          <BaseToast.Root key={toast.id} toast={toast} className={ui('db-toast', 'toast-root')}>
            <Icon
              name={
                toast.type === 'error'
                  ? 'circle-x'
                  : toast.type === 'warning'
                    ? 'triangle-alert'
                    : 'circle-check'
              }
              color={`var(--${toast.type === 'error' ? 'destructive' : toast.type === 'warning' ? 'priority-medium' : 'status-completed'})`}
            />
            <BaseToast.Content className={ui('db-toast-body')}>
              <BaseToast.Title className={ui('db-toast-title')} />
              <BaseToast.Description className={ui('db-toast-desc')} />
            </BaseToast.Content>
            {toast.actionProps && (
              <BaseToast.Action className={ui('db-btn')} data-variant="default" data-size="xs" />
            )}
            <BaseToast.Close
              render={
                <Button variant="ghost" size="icon-xs" icon="x" aria-label="Dismiss notification" />
              }
            />
          </BaseToast.Root>
        ))}
      </BaseToast.Viewport>
    </BaseToast.Portal>
  );
}
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider>
      <ToastViewport />
      {children}
    </BaseToast.Provider>
  );
}
