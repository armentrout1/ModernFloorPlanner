import React from 'react';
import { ZoomIn, ZoomOut, Home, Maximize2, Hand } from 'lucide-react';

interface CanvasControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToScreen: () => void;
  onTogglePanMode: () => void;
  isPanMode: boolean;
}

const CanvasControls: React.FC<CanvasControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToScreen,
  onTogglePanMode,
  isPanMode,
}) => {
  return (
    <div className="absolute top-4 right-4 bg-white rounded-md shadow-md z-10 flex flex-col">
      {/* Zoom Controls */}
      <div className="flex">
        <button
          className="p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors duration-150"
          onClick={onZoomIn}
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
          <span className="sr-only">Zoom In</span>
        </button>
        <button
          className="p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors duration-150 border-l border-slate-200"
          onClick={onZoomOut}
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
          <span className="sr-only">Zoom Out</span>
        </button>
      </div>
      
      {/* Navigation Controls */}
      <div className="flex border-t border-slate-200">
        <button
          className="p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors duration-150"
          onClick={onResetZoom}
          title="Reset View (Home)"
        >
          <Home className="h-4 w-4" />
          <span className="sr-only">Reset View</span>
        </button>
        <button
          className="p-2 text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors duration-150 border-l border-slate-200"
          onClick={onFitToScreen}
          title="Fit to Screen"
        >
          <Maximize2 className="h-4 w-4" />
          <span className="sr-only">Fit to Screen</span>
        </button>
      </div>
      
      {/* Pan Mode Toggle */}
      <div className="flex border-t border-slate-200">
        <button
          className={`p-2 transition-colors duration-150 ${
            isPanMode 
              ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' 
              : 'text-slate-600 hover:bg-slate-100'
          } active:bg-slate-200`}
          onClick={onTogglePanMode}
          title="Pan Mode (Hand Tool)"
        >
          <Hand className="h-4 w-4" />
          <span className="sr-only">Pan Mode</span>
        </button>
      </div>
    </div>
  );
};

export default CanvasControls;
