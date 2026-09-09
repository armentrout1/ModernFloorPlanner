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
import { MoreHorizontal as DotsHorizontalIcon } from 'lucide-react';
import { SavedSketch, fetchSavedSketches, fetchSketch, deleteSketch, renameSketch, sketchErrorMessage, isSketchAccessError } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';
import SketchPreview from './SketchPreview';

interface LoadSketchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadSketch: (sketch: SavedSketch) => void;
}

const LoadSketchDialog: React.FC<LoadSketchDialogProps> = ({
  open,
  onOpenChange,
  onLoadSketch,
}) => {
  const { toast } = useToast();
  const [sketches, setSketches] = useState<SavedSketch[]>([]);
  const [selectedSketchId, setSelectedSketchId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const renaming = useRef(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
        title: 'Sketch renamed',
        description: `Sketch has been renamed to "${newName}".`,
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
    if (!window.confirm('Are you sure you want to delete this sketch? This action cannot be undone.')) return;
    const generation = requestGeneration.current;
    try {
      await deleteSketch(id);
      if (generation !== requestGeneration.current) return;
      setSketches(current => current.filter(sketch => sketch.id !== id));
      if (selectedSketchId === id) setSelectedSketchId(null);
      setErrorMessage(null);
      toast({ title: 'Sketch deleted', description: 'The sketch has been deleted.' });
    } catch (error) {
      if (generation === requestGeneration.current) showError(error);
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
      onLoadSketch(current);
      onOpenChange(false);
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
          <DialogTitle>Load Sketch</DialogTitle>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto py-2">
          {errorMessage && <div className="mb-3 space-y-2">
            <p role="alert" className="text-sm text-red-700">{errorMessage}</p>
            <Button variant="outline" onClick={() => setReload(value => value + 1)} disabled={isLoading}>Retry saved sketches</Button>
          </div>}
          {editingId !== null && <div className="mb-3 rounded-md border bg-white p-3">
            <Input aria-label="New sketch name" disabled={isRenaming} value={newName}
              onChange={event => setNewName(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.repeat && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void saveNewName(editingId); } }}
              onCompositionStart={() => { composing.current = true; }}
              onCompositionEnd={() => { composing.current = false; }}
              onBlur={() => { if (!composing.current) void saveNewName(editingId); }} autoFocus />
          </div>}
          {isLoading ? <p role="status" className="py-10 text-center text-slate-500">Loading saved sketches...</p> : !errorMessage && sketches.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-slate-500">You don't have any saved sketches yet.</p>
              <p className="text-slate-400 text-sm mt-2">Create a floor plan and use the "Save Sketch" button to save it.</p>
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
                          >
                            <DotsHorizontalIcon className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleRename(sketch.id, sketch.name)}>
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDelete(sketch.id)}
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
            Load Selected Sketch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LoadSketchDialog;