import { useEffect, useRef, useState } from 'react';
import { Check, Cloud, CloudOff, LoaderCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { renameSketch, sketchErrorMessage, type SavedSketch } from '@/utils/api';

type SaveState = 'idle' | 'local' | 'saving' | 'saved' | 'error' | 'required';

interface PlanTitleEditorProps {
  sketchId?: number;
  value: string;
  onChange: (value: string) => void;
  onSaved: (sketch: SavedSketch) => void;
}

const labels: Record<SaveState, string> = {
  idle: 'Untitled draft',
  local: 'Draft name saved locally',
  saving: 'Saving name…',
  saved: 'Name saved',
  error: 'Name not saved',
  required: 'Name required',
};

export default function PlanTitleEditor({ sketchId, value, onChange, onSaved }: PlanTitleEditorProps) {
  const [saveState, setSaveState] = useState<SaveState>(value ? (sketchId ? 'saved' : 'local') : 'idle');
  const [localStatusVisible, setLocalStatusVisible] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const savedName = useRef(value.trim());
  const saveChain = useRef(Promise.resolve());
  const mounted = useRef(true);
  const onSavedRef = useRef(onSaved);

  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => {
    generation.current++;
    savedName.current = value.trim();
    setError('');
    setSaveState(value ? (sketchId ? 'saved' : 'local') : 'idle');
  // A new server id represents a newly saved or loaded document baseline.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketchId]);

  useEffect(() => {
    const name = value.trim();
    const currentGeneration = ++generation.current;
    setError('');
    if (!name) {
      setSaveState(value.length ? 'required' : 'idle');
      return;
    }
    if (!sketchId) {
      savedName.current = name;
      setSaveState('local');
      return;
    }
    if (name === savedName.current) {
      setSaveState('saved');
      return;
    }
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      saveChain.current = saveChain.current.then(async () => {
        if (currentGeneration !== generation.current) return;
        try {
          const saved = await renameSketch(sketchId, name);
          if (!mounted.current || currentGeneration !== generation.current) return;
          savedName.current = saved.name.trim();
          setSaveState('saved');
          onSavedRef.current(saved);
        } catch (failure) {
          if (!mounted.current || currentGeneration !== generation.current) return;
          setSaveState('error');
          setError(sketchErrorMessage(failure));
        }
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [sketchId, value]);

  useEffect(() => {
    if (saveState !== 'local') {
      setLocalStatusVisible(true);
      return;
    }
    setLocalStatusVisible(true);
    const timer = window.setTimeout(() => setLocalStatusVisible(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [saveState, value]);

  const StatusIcon = saveState === 'saving' ? LoaderCircle : saveState === 'saved' ? Check : saveState === 'error' ? CloudOff : Cloud;
  const statusHidden = saveState === 'local' && !localStatusVisible;
  return (
    <div className="min-w-[12rem] max-w-xs flex-1">
      <Input
        aria-label="Current floor plan name"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        placeholder="Untitled Floor Plan"
        maxLength={200}
        className="h-9 border-transparent bg-transparent px-2 text-base font-semibold shadow-none hover:border-slate-200 focus-visible:border-slate-300 focus-visible:ring-1"
      />
      <p className={`flex items-center gap-1 px-2 text-[11px] ${saveState === 'error' || saveState === 'required' ? 'text-red-700' : 'text-slate-500'} ${statusHidden ? 'invisible' : ''}`} aria-live="polite" aria-hidden={statusHidden} title={statusHidden ? undefined : error || labels[saveState]}>
        <StatusIcon className={`h-3 w-3 ${saveState === 'saving' ? 'animate-spin' : ''}`} />
        <span className="truncate">{error || labels[saveState]}</span>
      </p>
    </div>
  );
}
