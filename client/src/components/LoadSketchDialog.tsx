import { useLocalState } from '@/features/account/useLocalState';
import { isInputLayoutTransition, isInputLayoutControl } from '@/utils/inputLayout';
import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, FilePlus2, MoreHorizontal as DotsHorizontalIcon } from 'lucide-react';
import { SavedSketch, fetchSavedSketches, fetchSketch, deleteSketch, duplicateSketch, renameSketch, sketchErrorMessage, isSketchAccessError } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import SketchPreview from './SketchPreview';

interface LoadSketchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadSketch: (sketch: SavedSketch) => boolean | void;
  onNewPlan: () => void;
  onDeleteSketch?: (id: number) => void;
}

const LoadSketchDialog: React.FC<LoadSketchDialogProps> = ({
  open,
  onOpenChange,
  onLoadSketch,
  onNewPlan,
  onDeleteSketch,
}) => {
  const { toast } = useToast();
  const [sketches, setSketches] = useState<SavedSketch[]>([]);
  const [selectedSketchId, setSelectedSketchId] = useState<number | null>(null);
  const [editingId, setEditingId] = useLocalState<number | null>('legacy:rename-id', null);
  const [newName, setNewName] = useLocalState('legacy:rename-name', '');
  const renaming = useRef(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const requestGeneration = useRef(0);
  const composing = useRef(false);
  const loadingSelected = useRef(false);

  // Private rows are never reused on reopen, and an old request cannot repopulate
  // a closed/reopened dialog after a newer authorization result.
  useEffect(() => {
    const generation = ++requestGeneration.current;
    setSketches([]);
    setSelectedSketchId(null);
    if (!open) return;
    setIsLoading(true);
    setErrorMessage(null);
    fetchSavedSketches().then(loaded => {
      if (generation === requestGeneration.current) setSketches(loaded);
    }).catch(error => {
      if (generation === requestGeneration.current) setErrorMessage(sketchErrorMessage(error));
    }).finally(() => {
      if (generation === requestGeneration.current) setIsLoading(false);
    });
    return () => { requestGeneration.current++; };
  }, [open, reload]);

  const showError = (error: unknown) => {
    setErrorMessage(sketchErrorMessage(error));
    if (isSketchAccessError(error)) {
      setSketches([]);
      setSelectedSketchId(null);
    }
  };

  useEffect(() => {
    const invalidated = () => { requestGeneration.current++; setSketches([]); setSelectedSketchId(null); setIsLoading(false); };
    window.addEventListener('mfp-account-invalidated', invalidated);
    return () => { requestGeneration.current++; window.removeEventListener('mfp-account-invalidated', invalidated); };
  }, []);
  const selectedSketch = sketches.find(sketch => sketch.id === selectedSketchId);

  const handleRename = (id: number, name: string) => {
    setEditingId(id);
    setNewName(name);
    setErrorMessage(null);
  };

  const saveNewName = async (id: number) => {
    // Enter and blur can fire together before React commits a disabled state.
    if (renaming.current) return;
    if (!newName.trim()) {
      setEditingId(null);
      return;
    }
    renaming.current = true;
    setIsRenaming(true);
    const generation = requestGeneration.current;
    try {
      const updatedSketch = await renameSketch(id, newName);
      if (generation !== requestGeneration.current) return;
      setSketches(current => current.some(sketch => sketch.id === id)
        ? current.map(sketch => sketch.id === id ? updatedSketch : sketch)
        : [updatedSketch]);
      setErrorMessage(null);
      setEditingId(null);
      toast({
        title: 'Plan renamed',
        description: `Plan has been renamed to "${newName}".`,
      });
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      showError(error);
      toast({ title: 'Rename failed', description: sketchErrorMessage(error), variant: 'destructive' });
    } finally {
      renaming.current = false;
      setIsRenaming(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this saved plan? This action cannot be undone.')) return;
    const generation = requestGeneration.current;
    setProcessingId(id);
    try {
      await deleteSketch(id);
      if (generation !== requestGeneration.current) return;
      setSketches(current => current.filter(sketch => sketch.id !== id));
      if (selectedSketchId === id) setSelectedSketchId(null);
      setErrorMessage(null);
      onDeleteSketch?.(id);
      toast({ title: 'Plan deleted', description: 'The saved plan has been deleted.' });
    } catch (error) {
      if (generation === requestGeneration.current) showError(error);
    } finally {
      if (generation === requestGeneration.current) setProcessingId(null);
    }
  };

  const handleDuplicate = async (id: number) => {
    const generation = requestGeneration.current;
    setProcessingId(id);
    setErrorMessage(null);
    try {
      const copy = await duplicateSketch(id);
      if (generation !== requestGeneration.current) return;
      setSketches(current => [copy, ...current]);
      setSelectedSketchId(copy.id);
      toast({ title: 'Plan duplicated', description: `“${copy.name}” is ready to open.` });
    } catch (error) {
      if (generation === requestGeneration.current) showError(error);
    } finally {
      if (generation === requestGeneration.current) setProcessingId(null);
    }
  };

  const handleLoadSketch = async () => {
    if (!selectedSketch || loadingSelected.current) return;
    loadingSelected.current = true;
    setIsLoading(true);
    const generation = requestGeneration.current;
    try {
      // Recheck current server access rather than loading a possibly revoked
      // record from the list response cached in this dialog.
      const current = await fetchSketch(selectedSketch.id);
      if (generation !== requestGeneration.current) return;
      // A parent may require confirmation before replacing unfinished work.
      // Keep My Plans open when that confirmation is declined.
      if (onLoadSketch(current) !== false) onOpenChange(false);
    } catch (error) {
      if (generation === requestGeneration.current) showError(error);
    } finally {
      loadingSelected.current = false;
      if (generation === requestGeneration.current) setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>My Plans</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Saved to this workspace</p>
            <p className="text-xs text-slate-500">Open a recent plan or start a new one.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onNewPlan(); }}>
            <FilePlus2 className="mr-2 h-4 w-4" /> New plan
          </Button>
        </div>
        
        <div className="flex-grow overflow-y-auto py-2">
          {errorMessage && <div className="mb-3 space-y-2">
            <p role="alert" className="text-sm text-red-700">{errorMessage}</p>
            <Button variant="outline" onClick={() => setReload(value => value + 1)} disabled={isLoading}>Retry saved plans</Button>
          </div>}
          {editingId !== null && <div className="mb-3 rounded-md border bg-white p-3">
            <Input aria-label="New plan name" disabled={isRenaming} value={newName}
              onChange={event => setNewName(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.repeat && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void saveNewName(editingId); } }}
              onCompositionStart={() => { composing.current = true; }}
              onCompositionEnd={() => { composing.current = false; }}
              onBlur={event => { if (!composing.current && !isInputLayoutTransition(event.currentTarget) && !isInputLayoutControl(event.relatedTarget)) void saveNewName(editingId); }} autoFocus />
          </div>}
          {isLoading ? <p role="status" className="py-10 text-center text-slate-500">Loading saved plans…</p> : !errorMessage && sketches.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-slate-600">No saved plans yet.</p>
              <p className="text-slate-400 text-sm mt-2">Create a plan, draw a room, and choose Save plan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {sketches.filter(sketch => sketch.id !== editingId).map(sketch => (
                <div key={sketch.id} className="relative">
                    <>
                      <SketchPreview
                        sketch={sketch}
                        selected={selectedSketchId === sketch.id}
                        onClick={() => setSelectedSketchId(sketch.id)}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={`Options for ${sketch.name}`}
                            variant="ghost"
                            className="absolute top-2 right-2 h-6 w-6 p-0"
                            disabled={processingId === sketch.id}
                          >
                            <DotsHorizontalIcon className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => handleRename(sketch.id, sketch.name)}>
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void handleDuplicate(sketch.id)}>
                            <Copy className="h-4 w-4" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onSelect={() => void handleDelete(sketch.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={handleLoadSketch}
            disabled={!selectedSketchId || isLoading || Boolean(errorMessage)}
          >
            Open plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LoadSketchDialog;
