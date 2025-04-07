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
    
    // Calculate delta based on starting point
    const deltaX = e.clientX - startXRef.current;
    
    // Apply the delta based on panel position (left or right)
    // Multiply by 1.5 for faster response to small movements
    let newWidth = position === 'left' 
      ? startWidthRef.current + (deltaX * 1.5)
      : startWidthRef.current - (deltaX * 1.5);
    
    // Clamp width to min/max values
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    
    // Update immediately to give responsive feeling
    document.documentElement.style.cursor = 'col-resize';
    setPanelWidth(newWidth);
  };
  
  // Handle resize end event
  const handleResizeEnd = () => {
    setIsResizing(false);
    // Restore cursor
    document.documentElement.style.cursor = '';
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
    width: isExpanded ? panelWidth : 48,
    minWidth: isExpanded ? minWidth : 48,
    maxWidth: isExpanded ? maxWidth : 48,
    transition: isResizing ? 'none' : 'width 0.3s ease-in-out, background-color 0.3s ease',
    backgroundColor: isExpanded ? undefined : 'rgba(var(--primary-rgb), 0.06)',
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
        variant="outline"
        size="icon"
        className={cn(
          'absolute top-2 h-9 w-9 rounded-full bg-background shadow-md z-10 border-2',
          isExpanded ? 'border-primary/60 hover:border-primary/80' : 'border-primary/30 hover:border-primary/60',
          position === 'left' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
        )}
        onClick={togglePanel}
        title={isExpanded ? "Collapse panel" : "Expand panel"}
      >
        {position === 'left' ? (
          isExpanded ? <ChevronLeft className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-primary" />
        ) : (
          isExpanded ? <ChevronRight className="h-5 w-5 text-primary" /> : <ChevronLeft className="h-5 w-5 text-primary" />
        )}
      </Button>
      
      {/* Resize handle */}
      {isExpanded && (
        <div
          ref={resizeHandleRef}
          className={cn(
            'absolute top-0 h-full w-12 cursor-col-resize z-10 flex items-center justify-center',
            position === 'left' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2',
            isResizing ? 'opacity-100' : 'opacity-80 hover:opacity-100'
          )}
          onMouseDown={handleResizeStart}
          title="Drag to resize panel"
        >
          <div className="h-32 w-3 rounded-full bg-primary/30 hover:bg-primary/70 transition-colors flex items-center justify-center shadow-md">
            <div className="h-24 flex flex-col gap-2 justify-center items-center">
              <div className="w-5 h-1.5 bg-primary/80 rounded-full shadow-sm"></div>
              <div className="w-5 h-1.5 bg-primary/80 rounded-full shadow-sm"></div>
              <div className="w-5 h-1.5 bg-primary/80 rounded-full shadow-sm"></div>
              <div className="w-5 h-1.5 bg-primary/80 rounded-full shadow-sm"></div>
              <div className="w-5 h-1.5 bg-primary/80 rounded-full shadow-sm"></div>
            </div>
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
        <div className="h-full flex items-center justify-center py-8">
          <div className="text-sm font-medium text-primary/70 vertical-text whitespace-nowrap tracking-wide">
            {displayTitle}
          </div>
        </div>
      )}
    </div>
  );
};

export default CollapsiblePanel;