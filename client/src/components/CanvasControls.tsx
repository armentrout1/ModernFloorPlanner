import React from 'react';
import { Crosshair, Eye, Hand, Home, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CanvasControlsProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToScreen: () => void;
  onTogglePanMode: () => void;
  onCenterSelected?: () => void;
  onPreview: () => void;
  previewButtonRef?: React.Ref<HTMLButtonElement>;
  isPreviewMode: boolean;
  isPanMode: boolean;
}

const CanvasControls: React.FC<CanvasControlsProps> = ({
  scale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToScreen,
  onTogglePanMode,
  onCenterSelected,
  onPreview,
  previewButtonRef,
  isPreviewMode,
  isPanMode,
}) => {
  return (
    <div className="absolute right-14 top-3 z-30 flex flex-col items-end gap-2">
    <div data-testid="canvas-view-controls" role="toolbar" aria-label="Canvas navigation"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-md backdrop-blur-sm">
      <div className="flex items-center border-b border-slate-200">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-none"
          onClick={onZoomOut} title="Zoom Out" aria-label="Zoom Out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span data-testid="canvas-zoom-value"
          className="min-w-12 border-x border-slate-200 px-2 text-center text-xs font-medium tabular-nums text-slate-700"
          aria-label={`Canvas zoom ${Math.round(scale * 100)} percent`}>
          {Math.round(scale * 100)}%
        </span>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-none"
          onClick={onZoomIn} title="Zoom In" aria-label="Zoom In">
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-none"
          onClick={onResetZoom} title="Reset View to 100% (Home)" aria-label="Reset View to 100%">
          <Home className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-none border-l border-slate-200"
          onClick={onFitToScreen} title="Fit to Screen" aria-label="Fit drawing to screen">
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-none border-l border-slate-200"
          onClick={onTogglePanMode} title="Pan Mode (Hand Tool)" aria-label="Pan Mode" aria-pressed={isPanMode}>
          <Hand className={isPanMode ? 'h-4 w-4 text-blue-600' : 'h-4 w-4'} />
        </Button>
        {onCenterSelected && (
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-none border-l border-slate-200"
            onClick={onCenterSelected} title="Center Selected Room" aria-label="Center Selected Room">
            <Crosshair className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
    <Button ref={previewButtonRef} type="button" variant={isPreviewMode ? 'default' : 'outline'} size="sm"
      className="gap-1.5 bg-white/95 shadow-sm backdrop-blur-sm"
      onClick={onPreview}
      onKeyDown={event => {
        if ((event.key === 'p' || event.key === 'P') && !event.ctrlKey && !event.metaKey && !event.altKey
            && !event.repeat && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onPreview();
        }
      }}
      title="Toggle Preview Mode" aria-label="Floor Plan Preview">
      <Eye className="h-4 w-4" />
      <span className="hidden sm:inline">Preview</span>
    </Button>
    </div>
  );
};

export default CanvasControls;
