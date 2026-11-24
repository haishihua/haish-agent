import React, { useId, useState } from 'react';
import { Check, ChevronRight, Eye, EyeOff, Search, ShieldCheck, X } from 'lucide-react';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';
import { Input } from '../../../shared/ui/settings-elements/ui/input.tsx';
import { Field, FieldLabel, FieldDescription } from '../../../shared/ui/settings-elements/ui/field.tsx';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from '../../../shared/ui/settings-elements/ui/select.tsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '../../../shared/ui/settings-elements/ui/sheet.tsx';
import { Item, ItemContent, ItemDescription, ItemTitle, ItemMedia, ItemActions } from '../../../shared/ui/settings-elements/ui/item.tsx';
import { Switch } from '../../../shared/ui/settings-elements/ui/switch.tsx';
import { Badge } from '../../../shared/ui/settings-elements/ui/badge.tsx';
import { SettingsSwipeRow } from './SettingsSwipeRow.jsx';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '../../../shared/ui/settings-elements/ui/alert-dialog.tsx';


export function FieldRow({ label, hint, children }) {
  const id = useId();
  const child = React.Children.count(children) === 1 && React.isValidElement(children) ? children : null;
  return <Field className="settings-field-modern"><FieldLabel htmlFor={child ? child.props.id || id : undefined}>{label}</FieldLabel>{child ? React.cloneElement(child, { id: child.props.id || id }) : children}{hint && <FieldDescription>{hint}</FieldDescription>}</Field>;
}

export function SecretKeyField({ id, value = '', onChange, configured, disabled, placeholder = 'API key', ...props }) {
  const [visible, setVisible] = useState(false);
  return <div className="settings-secret-modern"><Input {...props} id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} disabled={disabled} placeholder={configured ? 'Leave blank to keep saved key' : placeholder} autoComplete="off" spellCheck={false} /><Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={visible ? 'Hide secret' : 'Show secret'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</Button>{configured && <span className="settings-key-saved"><ShieldCheck size={12} />Saved</span>}</div>;
}

export function SettingsMenuSelect({ id, value, options, onChange, disabled = false, placeholder = 'Select', header = '', className = '' }) {
  const triggerRef = React.useRef(null);
  const [menuTheme, setMenuTheme] = useState(undefined);
  const isWorkflow = className.includes('workflow-');
  const syncMenuTheme = (open) => {
    if (!open || !isWorkflow || !triggerRef.current) return;
    const styles = getComputedStyle(triggerRef.current);
    setMenuTheme(Object.fromEntries(['--workflow-detail-accent', '--workflow-detail-tint', '--workflow-detail-border']
      .map(name => [name, styles.getPropertyValue(name).trim()]).filter(([, value]) => value)));
  };
  // Radix Select reserves the empty value for its placeholder.
  const choices = options.filter(item => item.id);
  if (value && !choices.some(item => item.id === value)) choices.push({ id: value, label: value });
  const items = choices.map(item => <SelectItem key={item.id} value={item.id}>{item.label || item.id}</SelectItem>);
  // header 只是列表顶部的小标题（工作流的「project tools」），无分组语义，所以整段共用一个组。
  const body = header
    ? <SelectGroup><SelectLabel>{header}</SelectLabel>{items}</SelectGroup>
    : items;
  return <Select value={value || ''} onValueChange={onChange} onOpenChange={syncMenuTheme} disabled={disabled}><SelectTrigger ref={triggerRef} id={id} className={className ? `w-full ${className}` : 'w-full'}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent style={menuTheme} className={isWorkflow ? 'workflow-select-menu' : undefined} position="popper" align="start" sideOffset={4}>{body}</SelectContent></Select>;
}

export function SettingsSearch({ value, onChange, label }) {
  return <div className="settings-search-modern"><Search size={15} aria-hidden="true" /><input className="settings-search-input" type="search" aria-label={label} placeholder={`${label}…`} value={value} onChange={e => onChange(e.target.value)} />{value && <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => onChange('')}><X /></Button>}</div>;
}

export function SettingsToggleRow({ label, checked, onCheckedChange, disabled = false }) {
  return <div className="settings-toggle-modern"><span>{label}</span><Switch aria-label={label} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} /></div>;
}

export function SettingsRow({ title, description, icon, selected, onOpen, readOnly, badge, enabled, onToggle, busy, onDelete, deleteLabel = 'Delete', status, toggleLabel, toggleTitle }) {
  // 同一节里可能有两行同名 Provider（OpenAI API / OpenAI OAuth）：徽标就是无障碍名的区分位。
  const detail = badge ? ` ${badge}` : '';
  const row = <Item className={`settings-row-modern ${selected ? 'is-selected' : ''}`}>
    <Button variant="ghost" className="settings-row-main" onClick={onOpen} aria-label={`${readOnly ? 'View' : 'Edit'} ${title}${detail}`} aria-expanded={selected}>
      <ItemMedia>{icon}</ItemMedia><ItemContent><ItemTitle>{title}{readOnly && <Badge variant="secondary">Built-in</Badge>}{badge && <Badge variant="secondary">{badge}</Badge>}</ItemTitle>{description && <ItemDescription>{description}</ItemDescription>}</ItemContent>
      {status && <span className={`settings-row-status ${status.className || ''}`}>{status.className === 'success' && <Check size={12} />}{status.label}</span>}
      {!onToggle && <ChevronRight size={14} className="settings-row-chevron" />}
    </Button>
    {onToggle && <ItemActions><Switch aria-label={toggleLabel || `Enable ${title}${detail}`} title={toggleTitle} checked={enabled !== false} onCheckedChange={onToggle} disabled={busy} /></ItemActions>}
  </Item>;
  return onDelete ? <SettingsSwipeRow onDelete={onDelete} label={`${deleteLabel} ${title}${detail}`} busy={busy}>{row}</SettingsSwipeRow> : row;
}

export function SettingsSheet({ open, title, onClose, children }) {
  return <Sheet open={open} modal={false} onOpenChange={value => { if (!value) onClose(); }}><SheetContent className="settings-new-editor" aria-describedby={undefined} showCloseButton={false} onInteractOutside={event => event.preventDefault()}><SheetHeader><SheetTitle>{title}</SheetTitle><SheetClose asChild><Button variant="ghost" size="icon-sm" aria-label="Close editor"><X /></Button></SheetClose></SheetHeader>{children}</SheetContent></Sheet>;
}

export function SettingsDeleteDialog({ target, onClose, onConfirm, onToast, label = 'Delete' }) {
  const [busy, setBusy] = useState(false);
  return <AlertDialog open={Boolean(target)} onOpenChange={open => { if (!open && !busy) { onClose(); } }}><AlertDialogContent className="settings-delete-dialog"><AlertDialogHeader><AlertDialogTitle>{label} {target?.title}?</AlertDialogTitle><AlertDialogDescription>This item will be removed from your settings.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={async event => { event.preventDefault(); setBusy(true); try { if (await onConfirm(target) !== false) onClose(); } catch (failure) { onToast?.('error', String(failure?.message || failure)); } finally { setBusy(false); } }}>{busy ? 'Removing…' : label}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
