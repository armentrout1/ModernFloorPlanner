import { useLocalState } from '@/features/account/useLocalState';
import { isInputLayoutTransition, isInputLayoutControl } from '@/utils/inputLayout';
import { useInputRevert, type InputRevertOptions } from '@/components/InputRevert';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface OpeningSizeFieldProps {
  draftKey?: string;
  /** Accessible name, for example "Door width" or "Window height". */
  label: string;
  visibleLabel?: string;
  value: number | undefined;
  choices: number[];
  /** Return an error to leave the saved size and current draft unchanged. */
  onCommit: (value: number) => string | null | void;
}

const sizeError = 'Enter a positive size in inches. This edit has not been applied.';
const savedText = (value: number | undefined) => value === undefined ? '' : String(value);

/** One independent draft per dimension; the parent keys fields by opening ID. */
export default function OpeningSizeField({ label, visibleLabel, value, choices, onCommit, draftKey }: OpeningSizeFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useLocalState('legacy:opening-pending:' + (draftKey ?? label), false);
  const dirty = useRef(pending);
  const mounted = useRef(false);
  const menuOpening = useRef(false);
  const committedValue = useRef(value);
  const [text, setText] = useLocalState('legacy:opening-text:' + (draftKey ?? label), () => savedText(value));
  const [error, setError] = useLocalState<string | null>('legacy:opening-error:' + (draftKey ?? label), null);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    committedValue.current = value;
    dirty.current = false; setPending(false);
    setText(savedText(value));
    setError(null);
  }, [value]);

  const apply = (number: number) => {
    if (!Number.isFinite(number) || number <= 0 || number > Number.MAX_SAFE_INTEGER) {
      setError(sizeError);
      return false;
    }
    const message = onCommit(number);
    if (message) {
      setError(message);
      return false;
    }
    committedValue.current = number;
    dirty.current = false; setPending(false);
    setText(String(number));
    setError(null);
    return true;
  };

  const commitDraft = () => {
    if (!dirty.current) return;
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text.trim())) {
      setError(sizeError);
      return;
    }
    apply(Number(text));
  };

  const restore = () => {
    dirty.current = false; setPending(false);
    setText(savedText(committedValue.current));
    setError(null);
  };

  const dimension = label.trim().split(/\s+/).at(-1) || label;
  const fieldLabel = visibleLabel ?? `${dimension.charAt(0).toUpperCase()}${dimension.slice(1)} (in)`;

  return <div className="min-w-0 space-y-1">
    <Label htmlFor={id} className="text-xs">{fieldLabel}</Label>
    <div className="flex min-w-0">
      <Input ref={inputRef} id={id} type="number" inputMode="decimal" step="any" min="0"
        max={Number.MAX_SAFE_INTEGER} value={text} placeholder="Not entered"
        aria-label={label} aria-invalid={Boolean(error)}
        aria-describedby={error ? id + '-error' : undefined}
        className="h-9 min-w-0 rounded-r-none px-2 text-sm focus-visible:z-10"
        onChange={event => {
          setText(event.target.value);
          dirty.current = true; setPending(true);
          setError(null);
        }}
        onBlur={event => {
          // Menu focus should not apply a custom draft before the chosen preset.
          if (!menuOpening.current && !isInputLayoutTransition(inputRef.current) && !isInputLayoutControl(event.relatedTarget)) commitDraft();
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.repeat
              || event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commitDraft();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            restore();
          }
        }} />
      <DropdownMenu onOpenChange={open => { menuOpening.current = open; }}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon"
            className="h-9 w-9 shrink-0 rounded-l-none border-l-0"
            aria-label={'Common ' + label.toLowerCase()}
            onPointerDownCapture={event => {
              if (event.button === 0 && !event.ctrlKey && document.activeElement === inputRef.current) {
                menuOpening.current = true;
              }
            }}>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {choices.map(choice => <DropdownMenuItem key={choice} onSelect={() => { apply(choice); }}>
            {choice} in
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {error && <p id={id + '-error'} role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

/** The same compact common/custom control with raw text owned by a physical draft.
 * Conversion, validation and persistence belong to its typed commands. */
export function ControlledOpeningSizeField({ label, visibleLabel, text, choices = [], error, hint,
  disabled, onChange, onCommit, onPreset, revert: revertOptions }: {
  label: string; visibleLabel: string; text: string; choices?: number[];
  error?: string | null; hint?: string; disabled?: boolean;
  revert?: Omit<InputRevertOptions, 'onLeave'>;
  onChange: (text: string) => void; onCommit: () => void; onPreset?: (inches: number) => void;
}) {
  const id = useId(), inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false), menuOpening = useRef(false);
  const revert = useInputRevert(inputRef, revertOptions ? { ...revertOptions, onLeave: () => {} } : undefined);
  return <div className={"min-w-0 space-y-1" + (revertOptions ? " relative" : "")}>
    <Label htmlFor={id} className={"text-xs" + (revertOptions ? " block min-h-7 pr-16" : "")}>{visibleLabel}</Label>
    <div className="flex min-w-0">
      <Input ref={inputRef} id={id} type="text" value={text} disabled={disabled}
        placeholder="Not entered" autoComplete="off" spellCheck={false}
        data-physical-pending={revertOptions?.pending ? "true" : undefined}
        aria-label={label} aria-invalid={Boolean(error)} aria-describedby={id + '-help'}
        className={'h-9 min-w-0 px-2 text-sm focus-visible:z-10' + (choices.length ? ' rounded-r-none' : '')}
        onChange={event => onChange(event.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={event => {
          if (revert.onInputKeyDown(event, composing.current || menuOpening.current)) return;
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) return;
          if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onCommit(); }
        }} />
      {revert.control}
      {choices.length && onPreset ? <DropdownMenu onOpenChange={open => { menuOpening.current = open; }}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" disabled={disabled}
            className="h-9 w-9 shrink-0 rounded-l-none border-l-0" aria-label={'Common ' + label.toLowerCase()}
            onPointerDownCapture={event => { if (event.button === 0 && (document.activeElement === inputRef.current || revert.isRevertFocus(document.activeElement))) menuOpening.current = true; }}>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto">
          {choices.map(choice => <DropdownMenuItem key={choice} onSelect={() => onPreset(choice)}>{choice} in</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu> : null}
    </div>
    <p id={id + '-help'} role={error ? 'alert' : undefined} className={'text-xs leading-4 ' + (error ? 'text-red-700' : 'text-slate-500')}>
      {error || hint}
    </p>
  </div>;
}
