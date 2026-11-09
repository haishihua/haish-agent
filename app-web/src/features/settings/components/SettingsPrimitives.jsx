import React, { useId, useState } from 'react';
import { Check, ChevronRight, Ellipsis, Eye, EyeOff, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';
import { Input } from '../../../shared/ui/settings-elements/ui/input.tsx';
import { Field, FieldLabel, FieldDescription } from '../../../shared/ui/settings-elements/ui/field.tsx';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../shared/ui/settings-elements/ui/select.tsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '../../../shared/ui/settings-elements/ui/sheet.tsx';
import { Item, ItemContent, ItemDescription, ItemTitle, ItemMedia, ItemActions } from '../../../shared/ui/settings-elements/ui/item.tsx';
import { Switch } from '../../../shared/ui/settings-elements/ui/switch.tsx';
import { Badge } from '../../../shared/ui/settings-elements/ui/badge.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../shared/ui/settings-elements/ui/dropdown-menu.tsx';
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

export function SettingsMenuSelect({ id, value, options, onChange, disabled = false, placeholder = 'Select' }) {
  // Radix Select reserves the empty value for its placeholder.
  const choices = options.filter(item => item.id);
  if (value && !choices.some(item => item.id === value)) choices.push({ id: value, label: value });
  return <Select value={value || ''} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent position="popper">{choices.map(item => <SelectItem key={item.id} value={item.id}>{item.label || item.id}</SelectItem>)}</SelectContent></Select>;
}

export function SettingsSearch({ value, onChange, label }) {
  return <div className="settings-search-modern"><Search size={15} /><Input type="search" aria-label={label} placeholder={`${label}…`} value={value} onChange={e => onChange(e.target.value)} />{value && <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => onChange('')}><X /></Button>}</div>;
}

export function SettingsToggleRow({ label, checked, onCheckedChange, disabled = false }) {
  return <div className="settings-toggle-modern"><span>{label}</span><Switch aria-label={label} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} /></div>;
}

export function SettingsRow({ title, description, icon, selected, onOpen, readOnly, badge, enabled, onToggle, busy, onDelete, deleteLabel = 'Delete', status, toggleLabel, toggleTitle }) {
  // 同一节里可能有两行同名 Provider（OpenAI API / OpenAI OAuth）：徽标就是无障碍名的区分位。
  const detail = badge ? ` ${badge}` : '';
  return <Item className={`settings-row-modern ${selected ? 'is-selected' : ''}`}>
    <Button variant="ghost" className="settings-row-main" onClick={onOpen} aria-label={`${readOnly ? 'View' : 'Edit'} ${title}${detail}`} aria-expanded={selected}>
      <ItemMedia>{icon}</ItemMedia><ItemContent><ItemTitle>{title}{readOnly && <Badge variant="secondary">Built-in</Badge>}{badge && <Badge variant="secondary">{badge}</Badge>}</ItemTitle>{description && <ItemDescription>{description}</ItemDescription>}</ItemContent>
      {status && <span className={`settings-row-status ${status.className || ''}`}>{status.className === 'success' && <Check size={12} />}{status.label}</span>}
      {!onToggle && <ChevronRight size={14} className="settings-row-chevron" />}
    </Button>
    {(onToggle || onDelete) && <ItemActions>{onToggle && <Switch aria-label={toggleLabel || `Enable ${title}${detail}`} title={toggleTitle} checked={enabled !== false} onCheckedChange={onToggle} disabled={busy} />}{onDelete && <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`More actions for ${title}${detail}`} disabled={busy}><Ellipsis /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 />{deleteLabel}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</ItemActions>}
  </Item>;
}

export function SettingsSheet({ open, title, onClose, children }) {
  return <Sheet open={open} modal={false} onOpenChange={value => { if (!value) onClose(); }}><SheetContent className="settings-new-editor" aria-describedby={undefined} showCloseButton={false} onInteractOutside={event => event.preventDefault()}><SheetHeader><SheetTitle>{title}</SheetTitle><SheetClose asChild><Button variant="ghost" size="icon-sm" aria-label="Close editor"><X /></Button></SheetClose></SheetHeader>{children}</SheetContent></Sheet>;
}

export function SettingsDeleteDialog({ target, onClose, onConfirm, label = 'Delete' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <AlertDialog open={Boolean(target)} onOpenChange={open => { if (!open && !busy) { setError(''); onClose(); } }}><AlertDialogContent className="settings-delete-dialog"><AlertDialogHeader><AlertDialogTitle>{label} {target?.title}?</AlertDialogTitle><AlertDialogDescription>This item will be removed from your settings.</AlertDialogDescription></AlertDialogHeader>{error && <ErrorState variant="inline" detail={error} />}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={async event => { event.preventDefault(); setBusy(true); setError(''); try { if (await onConfirm(target) !== false) onClose(); } catch (failure) { setError(String(failure?.message || failure)); } finally { setBusy(false); } }}>{busy ? 'Removing…' : label}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
