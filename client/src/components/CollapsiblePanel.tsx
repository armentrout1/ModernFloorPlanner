import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Maximize, Minimize } from 'lucide-react';
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
  minWidth = 200, // Increased minimum width for better usability
  maxWidth = 400,
  title,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [panelWidth, setPanelWidth] = useState(width);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeMode, setResizeMode] = useState(false);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  
  // Determine panel title from position if not provided
  const displayTitle = title || (position === 'left' ? 'Tools' : 'Properties');
  
  // Toggle panel expanded/collapsed state
  const togglePanel = () => {
    setIsExpanded(!isExpanded);
  };
  
  // Toggle resize mode
  const toggleResizeMode = () => {
    // If turning off resize mode while actually resizing, cancel the resize
    if (resizeMode && isResizing) {
      setPanelWidth(startWidthRef.current);
      setIsResizing(false);
      document.documentElement.style.cursor = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      window.removeEventListener('touchend', handleResizeEnd);
      window.removeEventListener('keydown', handleKeyDown);
    }
    setResizeMode(!resizeMode);
  };
  
  // Handle resize start event for both mouse and touch
  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    // Handle both mouse and touch events
    if ('clientX' in e) {
      // Mouse event
      startXRef.current = e.clientX;
    } else {
      // Touch event
      startXRef.current = e.touches[0].clientX;
    }
    
    startWidthRef.current = panelWidth;
    
    // Add event listeners to window for mouse/touch move, up/end, and key events
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('mouseup', handleResizeEnd);
    window.addEventListener('touchend', handleResizeEnd);
    window.addEventListener('keydown', handleKeyDown);
  };
  
  // Handle touch move event (separate from mouse move for better performance)
  const handleTouchMove = (e: TouchEvent) => {
    e.preventDefault(); // Prevent scrolling during resize
    
    if (!isResizing) return;
    
    // Calculate delta based on starting point
    const clientX = e.touches[0].clientX;
    const deltaX = clientX - startXRef.current;
    
    // Apply the delta based on panel position (left or right)
    // Use a more sensitive multiplier for touch (2.5 instead of 1.5)
    let newWidth = position === 'left' 
      ? startWidthRef.current + (deltaX * 2.5)
      : startWidthRef.current - (deltaX * 2.5);
    
    // Clamp width to min/max values
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    
    // Prevent jumpy behavior by updating the start reference occasionally
    if (Math.abs(deltaX) > 40) {
      startXRef.current = clientX;
      startWidthRef.current = newWidth;
    }
    
    // Update immediately to give responsive feeling
    setPanelWidth(newWidth);
  };
  
  // Handle keydown for Escape to cancel resize
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isResizing) {
      // Cancel the resize operation
      setPanelWidth(startWidthRef.current);
      setIsResizing(false);
      
      // Auto-exit resize mode after finishing resize
      setResizeMode(false);
      
      // Reset cursor
      document.documentElement.style.cursor = '';
      document.body.style.cursor = '';
      
      // Remove all event listeners
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      window.removeEventListener('touchend', handleResizeEnd);
      window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isResizing]);

  // Handle resize move event
  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing) return;
    
    // Calculate delta based on starting point
    const clientX = e.clientX;
    const deltaX = clientX - startXRef.current;
    
    // Apply the delta based on panel position (left or right)
    // Multiply by 1.5 for faster response to small movements
    let newWidth = position === 'left' 
      ? startWidthRef.current + (deltaX * 1.5)
      : startWidthRef.current - (deltaX * 1.5);
    
    // Clamp width to min/max values
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    
    // Prevent jumpy behavior by updating the start reference occasionally
    if (Math.abs(deltaX) > 80) {
      startXRef.current = clientX;
      startWidthRef.current = newWidth;
    }
    
    // Update immediately to give responsive feeling
    document.documentElement.style.cursor = 'col-resize';
    setPanelWidth(newWidth);
  };
  
  // Handle resize end event
  const handleResizeEnd = () => {
    setIsResizing(false);
    
    // Auto-exit resize mode after finishing resize
    setResizeMode(false);
    
    // Restore cursor - important to prevent cursor from getting stuck
    document.documentElement.style.cursor = '';
    document.body.style.cursor = '';
    
    // Remove all event listeners - both mouse and touch
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('mouseup', handleResizeEnd);
    window.removeEventListener('touchend', handleResizeEnd);
    window.removeEventListener('keydown', handleKeyDown);
  };
  
  // Reset cursor function
  const resetCursor = useCallback(() => {
    document.documentElement.style.cursor = '';
    document.body.style.cursor = '';
    // Force a style recalculation
    document.documentElement.clientHeight;
  }, []);
  
  // Clean up event listeners when component unmounts
  useEffect(() => {
    return () => {
      // Safety cleanup - ensure we remove listeners and reset cursor
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      window.removeEventListener('touchend', handleResizeEnd);
      window.removeEventListener('keydown', handleKeyDown);
      
      // Always restore cursor on unmount to prevent "stuck" cursor
      resetCursor();
    };
  }, [handleKeyDown, resetCursor, handleTouchMove]);
  
  // Initial cleanup on mount to fix any stuck cursors
  useEffect(() => {
    resetCursor();
  }, [resetCursor]);
  
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
      ref={panelRef}
      className={cn(
        'bg-slate-50 border-slate-200 flex flex-col h-full relative', 
        position === 'left' ? 'border-r' : 'border-l', 
        className
      )}
      style={panelStyle}
    >
      {/* Controls container - positioned at the top corner of the panel */}
      <div className={cn(
        'absolute flex items-center z-20 gap-1 p-1 bg-slate-100/80 rounded border border-slate-200 shadow-sm',
        position === 'left' 
          ? 'top-1 right-1' 
          : 'top-1 left-1'
      )}>
        {/* Toggle expand/collapse button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-6 w-6 rounded-full bg-background/50',
            isExpanded ? 'hover:bg-background' : 'hover:bg-background',
          )}
          onClick={togglePanel}
          title={isExpanded ? "Collapse panel" : "Expand panel"}
        >
          {position === 'left' ? (
            isExpanded ? <ChevronLeft className="h-3 w-3 text-primary" /> : <ChevronRight className="h-3 w-3 text-primary" />
          ) : (
            isExpanded ? <ChevronRight className="h-3 w-3 text-primary" /> : <ChevronLeft className="h-3 w-3 text-primary" />
          )}
        </Button>
        
        {/* No longer needed since resize handle is always available */}
      </div>
      
      {/* Resize handle - always show when panel is expanded */}
      {isExpanded && (
        <div
          ref={resizeHandleRef}
          className={cn(
            'absolute top-0 h-full w-8 cursor-col-resize z-10 flex items-center justify-center resize-handle',
            position === 'left' ? 'right-0 -mr-4' : 'left-0 -ml-4',
            isResizing ? 'opacity-100' : 'opacity-0 hover:opacity-70'
          )}
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
          title="Drag to resize panel"
        >
          {/* Background for handle - makes it easier to grab */}
          <div className={cn(
            'absolute h-full w-full opacity-0 hover:opacity-10 bg-primary/10 transition-opacity'
          )} />
          
          {/* Vertical line */}
          <div 
            className={cn(
              "h-full w-1", 
              isResizing ? "bg-primary" : "bg-primary/40"
            )}
          />
          
          {/* Visual indicator for drag direction */}
          <div className={cn(
            "absolute pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
            isResizing ? "opacity-100" : "opacity-60"
          )}>
            <div className="flex items-center justify-center">
              <div className="flex gap-1">
                <ChevronLeft className="h-3 w-3 text-primary" />
                <ChevronRight className="h-3 w-3 text-primary" />
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Panel content - visible only when expanded */}
      <div className={cn(
        'flex-grow overflow-auto panel-content overflow-fix p-3',
        !isExpanded && 'invisible'
      )}>
        <div className="w-full h-full space-y-3">
          {children}
        </div>
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