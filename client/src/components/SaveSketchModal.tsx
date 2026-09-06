import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Room } from '@/utils/types';
import { saveSketch, SavedSketch } from '@/utils/api';
import { useToast } from '@/hooks/use-toast';

interface SaveSketchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Room[];
  currentSketchId?: number;
  currentSketchName?: string;
  onSave: (savedSketch: SavedSketch) => void;
}

const SaveSketchModal: React.FC<SaveSketchModalProps> = ({
  open,
  onOpenChange,
  rooms,
  currentSketchId,
  currentSketchName = '',
  onSave,
}) => {
  const { toast } = useToast();
  const [sketchName, setSketchName] = useState(currentSketchName);

  const saving = useRef(false);
  // Reset only when changing sketches; reopening a failed save preserves the draft name.
  useEffect(() => { setSketchName(currentSketchName); }, [currentSketchId, currentSketchName]);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (saving.current) return;
    if (!sketchName.trim()) {
      toast({
        title: 'Sketch name required',
        description: 'Please enter a name for your sketch.',
        variant: 'destructive',
      });
      return;
    }

    // Save the sketch
    saving.current = true;
    setIsSaving(true);
    try {
      const savedSketch = await saveSketch(sketchName, rooms, currentSketchId);
      toast({
        title: 'Sketch saved!',
        description: `"${sketchName}" has been saved successfully.`,
      });
      
      // Pass the saved sketch back to the parent component
      onSave(savedSketch);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving sketch:', error);
      toast({
        title: 'Error saving sketch',
        description: 'An error occurred while saving your sketch.',
        variant: 'destructive',
      });
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.repeat && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!saving.current) onOpenChange(nextOpen); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Save Sketch</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sketch-name" className="text-right">
              Sketch Name
            </Label>
            <Input
              id="sketch-name"
              disabled={isSaving}
              value={sketchName}
              onChange={(e) => setSketchName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="My Floor Plan"
              className="col-span-3"
              autoFocus
            />
          </div>
          <div className="text-sm text-slate-500 col-span-4 pl-4">
            Your sketch will be saved with {rooms.length} room{rooms.length !== 1 ? 's' : ''}.
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSaving}>Cancel</Button>
          </DialogClose>
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Sketch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveSketchModal;