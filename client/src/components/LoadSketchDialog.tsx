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
import { SavedSketch, fetchSavedSketches, deleteSketch, renameSketch } from '@/utils/api';
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

  // Load sketches when dialog opens
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      fetchSavedSketches()
        .then(loadedSketches => {
          setSketches(loadedSketches);
          setSelectedSketchId(null);
        })
        .finally(() => setIsLoading(false));
    }
  }, [open]);

  const selectedSketch = sketches.find(sketch => sketch.id === selectedSketchId);

  const handleRename = (id: number, name: string) => {
    setEditingId(id);
    setNewName(name);
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
    try {
      const updatedSketch = await renameSketch(id, newName);
      if (!updatedSketch) {
        toast({
          title: 'Rename failed',
          description: 'Your draft name is preserved. Try saving it again.',
          variant: 'destructive',
        });
        return;
      }
      setSketches(current => current.map(sketch =>
        sketch.id === id ? updatedSketch : sketch
      ));
      setEditingId(null);
      toast({
        title: 'Sketch renamed',
        description: `Sketch has been renamed to "${newName}".`,
      });
    } finally {
      renaming.current = false;
      setIsRenaming(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this sketch? This action cannot be undone.')) {
      const success = await deleteSketch(id);
      if (success) {
        setSketches(sketches.filter(sketch => sketch.id !== id));
        if (selectedSketchId === id) {
          setSelectedSketchId(null);
        }
        toast({
          title: 'Sketch deleted',
          description: 'The sketch has been deleted.',
        });
      }
    }
  };

  const handleLoadSketch = () => {
    if (selectedSketch) {
      onLoadSketch(selectedSketch);
      onOpenChange(false);
    } else {
      toast({
        title: 'No sketch selected',
        description: 'Please select a sketch to load.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Load Sketch</DialogTitle>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto py-2">
          {sketches.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-slate-500">You don't have any saved sketches yet.</p>
              <p className="text-slate-400 text-sm mt-2">
                Create a floor plan and use the "Save Sketch" button to save it.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {sketches.map(sketch => (
                <div key={sketch.id} className="relative">
                  {editingId === sketch.id ? (
                    <div className="p-3 border rounded-md bg-white">
                      <Input
                        aria-label="New sketch name"
                        disabled={isRenaming}
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveNewName(sketch.id)}
                        onBlur={() => saveNewName(sketch.id)}
                        autoFocus
                      />
                    </div>
                  ) : (
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
                  )}
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
            disabled={!selectedSketchId}
          >
            Load Selected Sketch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LoadSketchDialog;