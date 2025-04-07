import React from 'react';
import { Button } from '@/components/ui/button';
import { FileIcon, SaveIcon, FolderOpenIcon } from 'lucide-react';

interface AppHeaderProps {
  onNewSketch: () => void;
  onSaveSketch: () => void;
  onLoadSketch: () => void;
  canSave: boolean;
}

const AppHeader: React.FC<AppHeaderProps> = ({ 
  onNewSketch, 
  onSaveSketch, 
  onLoadSketch,
  canSave 
}) => {
  return (
    <header className="bg-white shadow-sm border-b border-slate-200 px-4 py-3 flex justify-between items-center">
      <div className="flex items-center">
        <h1 className="text-xl font-bold text-primary">Modern Floor Planner</h1>
      </div>
      <div className="flex items-center space-x-3">
        <Button 
          onClick={onLoadSketch}
          variant="outline"
          className="flex items-center"
        >
          <FolderOpenIcon className="mr-2 h-4 w-4" />
          Load Sketch
        </Button>
        
        <Button 
          onClick={onSaveSketch}
          variant="outline"
          className="flex items-center"
          disabled={!canSave}
        >
          <SaveIcon className="mr-2 h-4 w-4" />
          Save Sketch
        </Button>
        
        <Button 
          onClick={onNewSketch}
          className="bg-primary hover:bg-primary/90 text-white flex items-center"
        >
          <FileIcon className="mr-2 h-4 w-4" />
          New Sketch
        </Button>
      </div>
    </header>
  );
};

export default AppHeader;
