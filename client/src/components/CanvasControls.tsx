import React from 'react';
import { SearchIcon, HomeIcon } from 'lucide-react';

interface CanvasControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

const CanvasControls: React.FC<CanvasControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  return (
    <div className="absolute top-4 right-4 bg-white rounded-md shadow-md z-10 flex">
      <button
        className="p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors duration-150"
        onClick={onZoomIn}
        title="Zoom In"
      >
        <SearchIcon className="h-4 w-4" />
        <span className="sr-only">Zoom In</span>
      </button>
      <button
        className="p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors duration-150 border-l border-r border-slate-200"
        onClick={onResetZoom}
        title="Reset Zoom"
      >
        <HomeIcon className="h-4 w-4" />
        <span className="sr-only">Reset Zoom</span>
      </button>
      <button
        className="p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors duration-150"
        onClick={onZoomOut}
        title="Zoom Out"
      >
        <SearchIcon className="h-4 w-4" style={{ transform: 'scale(-1, 1)' }} />
        <span className="sr-only">Zoom Out</span>
      </button>
    </div>
  );
};

export default CanvasControls;
