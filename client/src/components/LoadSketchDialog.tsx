import React, { useState, useEffect } from 'react';
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
import { SavedSketch, getSavedSketches, deleteSketch, renameSketch } from '@/utils/sketchStorage';
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
  const [selectedSketchId, setSelectedSketchId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  // Load sketches when dialog opens
  useEffect(() => {
    if (open) {
      const loadedSketches = getSavedSketches();
      setSketches(loadedSketches);
      setSelectedSketchId(null);
    }
  }, [open]);

  const selectedSketch = sketches.find(sketch => sketch.id === selectedSketchId);

  const handleRename = (id: string, name: string) => {
    setEditingId(id);
    setNewName(name);
  };

  const saveNewName = (id: string) => {
    if (newName.trim()) {
      const updatedSketch = renameSketch(id, newName);
      if (updatedSketch) {
        setSketches(sketches.map(sketch => 
          sketch.id === id ? updatedSketch : sketch
        ));
        toast({
          title: 'Sketch renamed',
          description: `Sketch has been renamed to "${newName}".`,
        });
      }
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this sketch? This action cannot be undone.')) {
      const deleted = deleteSketch(id);
      if (deleted) {
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