import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Keyboard, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface KeyboardShortcut {
  keys: string[];
  description: string;
  category: string;
}

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts: KeyboardShortcut[] = [
  // Primary Tools
  { keys: ['R'], description: 'Activate Room drawing tool', category: 'Tools' },
  { keys: ['M'], description: 'Activate Move/Select tool', category: 'Tools' },
  { keys: ['D'], description: 'Activate Door placement tool', category: 'Tools' },
  { keys: ['W'], description: 'Activate Window placement tool', category: 'Tools' },
  
  // Object Manipulation
  { keys: ['Delete'], description: 'Remove selected room or object', category: 'Edit' },
  { keys: ['Backspace'], description: 'Remove selected room or object', category: 'Edit' },
  { keys: ['Escape'], description: 'Deselect all items / Exit preview mode', category: 'Edit' },
  { keys: ['Shift', 'Click'], description: 'Multi-select rooms', category: 'Edit' },
  
  { keys: ['Ctrl/Cmd', 'Z'], description: 'Undo last room or opening deletion in this sketch session', category: 'Edit' },

  // Navigation & View
  { keys: ['Mouse Wheel'], description: 'Scroll canvas', category: 'Navigation' },
  { keys: ['Middle Button', 'Drag'], description: 'Pan canvas (hold to drag)', category: 'Navigation' },
  { keys: ['Space', 'Drag'], description: 'Pan canvas', category: 'Navigation' },
  { keys: ['+', '='], description: 'Zoom in', category: 'Navigation' },
  { keys: ['-'], description: 'Zoom out', category: 'Navigation' },
  { keys: ['P'], description: 'Toggle preview mode', category: 'Navigation' },
  
  // Text Editing
  { keys: ['Enter'], description: 'Save room name', category: 'Text' },
  { keys: ['Escape'], description: 'Cancel room name editing', category: 'Text' },
];

const categories = Array.from(new Set(shortcuts.map(s => s.category)));

const KeyboardShortcutsDialog = ({ open, onOpenChange }: KeyboardShortcutsDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          {categories.map(category => (
            <div key={category} className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-200 pb-1">
                {category}
              </h3>
              <div className="space-y-2">
                {shortcuts
                  .filter(shortcut => shortcut.category === category)
                  .map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                      <span className="text-sm text-slate-700 flex-1">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <div key={keyIndex} className="flex items-center gap-1">
                            <Badge 
                              variant="secondary" 
                              className="px-2 py-1 text-xs font-mono bg-white border border-slate-300 text-slate-800"
                            >
                              {key}
                            </Badge>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="text-xs text-slate-500">+</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> These shortcuts work when the canvas is focused. Some shortcuts may not work when typing in text fields.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsDialog;