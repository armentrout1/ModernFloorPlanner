import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CollapsiblePanelProps {
  children: React.ReactNode;
  className?: string;
  defaultExpanded?: boolean;
  position: 'left' | 'right';
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  title?: string; // Optional title to show when collapsed
}

const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  children,
  className,
  defaultExpanded = true,
  position,
  width = 250,
  minWidth = 50,
  maxWidth = 400,
  title,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [panelWidth, setPanelWidth] = useState(width);
  const [isResizing, setIsResizing] = useState(false);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  
  // Determine panel title from position if not provided
  const displayTitle = title || (position === 'left' ? 'Tools' : 'Properties');
  
  // Toggle panel expanded/collapsed state
  const togglePanel = () => {
    setIsExpanded(!isExpanded);
  };
  
  // Handle resize start event
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
    
    // Add event listeners to window for mouse move and up
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  };
  
  // Handle resize move event
  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - startXRef.current;
    // Apply the delta based on panel position (left or right)
    let newWidth = position === 'left' 
      ? startWidthRef.current + deltaX 
      : startWidthRef.current - deltaX;
    
    // Clamp width to min/max values
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    setPanelWidth(newWidth);
  };
  
  // Handle resize end event
  const handleResizeEnd = () => {
    setIsResizing(false);
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
  };
  
  // Clean up event listeners when component unmounts
  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }, []);
  
  // Calculate panel style based on expanded state and current width
  const panelStyle: React.CSSProperties = {
    width: isExpanded ? panelWidth : 40,
    minWidth: isExpanded ? minWidth : 40,
    maxWidth: isExpanded ? maxWidth : 40,
    transition: isResizing ? 'none' : 'width 0.3s ease-in-out',
  };
  
  return (
    <div 
      className={cn(
        'bg-slate-50 border-slate-200 flex flex-col h-full relative', 
        position === 'left' ? 'border-r' : 'border-l', 
        className
      )}
      style={panelStyle}
    >
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'absolute top-2 h-8 w-8 rounded-full bg-white shadow-md z-10',
          position === 'left' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
        )}
        onClick={togglePanel}
      >
        {position === 'left' ? (
          isExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
        ) : (
          isExpanded ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />
        )}
      </Button>
      
      {/* Resize handle */}
      {isExpanded && (
        <div
          ref={resizeHandleRef}
          className={cn(
            'absolute top-0 h-full w-4 cursor-col-resize z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity',
            position === 'left' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
          )}
          onMouseDown={handleResizeStart}
        >
          <div className="h-16 w-1 rounded-full bg-slate-300 hover:bg-slate-400 transition-colors">
            <GripVertical className="text-slate-500 h-4 w-4 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-50" />
          </div>
        </div>
      )}
      
      {/* Panel content - visible only when expanded */}
      <div className={cn(
        'flex-grow overflow-auto',
        !isExpanded && 'invisible'
      )}>
        {children}
      </div>
      
      {/* Collapsed panel label */}
      {!isExpanded && (
        <div className="h-full flex items-center justify-center">
          <div className="text-xs text-slate-500 vertical-text transform -rotate-90 whitespace-nowrap">
            {displayTitle}
          </div>
        </div>
      )}
    </div>
  );
};

export default CollapsiblePanel;