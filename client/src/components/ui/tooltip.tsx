import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

// Enhanced Tooltip Provider with improved defaults for better UX
const TooltipProvider = ({ 
  // Lower delay for faster feedback
  delayDuration = 400, 
  // Faster skip delay for more responsive tooltips
  skipDelayDuration = 100, 
  // Allow hoverable content for better interaction
  disableHoverableContent = false, 
  ...props 
}: TooltipPrimitive.TooltipProviderProps) => (
  <TooltipPrimitive.Provider
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
    disableHoverableContent={disableHoverableContent}
    {...props}
  />
)

// Enhanced Tooltip with auto-hiding functionality
const Tooltip = ({ 
  defaultOpen = false, 
  open, 
  onOpenChange,
  ...props 
}: TooltipPrimitive.TooltipProps & { 
  autoClose?: boolean;
  autoCloseDelay?: number;
}) => {
  return (
    <TooltipPrimitive.Root
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    />
  )
}

const TooltipTrigger = TooltipPrimitive.Trigger

// Enhanced TooltipContent with improved positioning and styling
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ 
  className, 
  sideOffset = 4, 
  // Ensure tooltips won't get cut off
  avoidCollisions = true, 
  collisionPadding = 8,
  side = "right", 
  align = "center", 
  ...props 
}, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    avoidCollisions={avoidCollisions}
    collisionPadding={collisionPadding}
    side={side}
    align={align}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

// Improved Centered Tooltip Content with better positioning and styling
const CenteredTooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    // Allow for positioning the tooltip with an offset from center
    offsetY?: number;
  }
>(({ className, offsetY = 0, ...props }, ref) => {
  // State to track if tooltip was shown at least once
  const [hasShown, setHasShown] = React.useState(false);
  
  // Set hasShown to true when tooltip is shown
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setHasShown(true);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Auto-hide the tooltip after a delay
  React.useEffect(() => {
    if (hasShown) {
      const timer = setTimeout(() => {
        // Dispatch ESC key event to close the tooltip
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [hasShown]);
  
  return (
    <TooltipPrimitive.Portal>
      <div 
        className={`fixed inset-0 flex items-center justify-center pointer-events-none z-50 ${
          hasShown ? 'animate-in fade-in-0' : ''
        }`}
        style={{ 
          // Apply vertical offset if specified
          transform: offsetY ? `translateY(${offsetY}px)` : 'none'
        }}
      >
        <div className="max-w-sm"> {/* Limit width for better readability */}
          <TooltipPrimitive.Content
            ref={ref}
            className={cn(
              "pointer-events-auto rounded-md border bg-black text-white px-4 py-2 text-sm font-medium shadow-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              className
            )}
            {...props}
          />
        </div>
      </div>
    </TooltipPrimitive.Portal>
  );
})
CenteredTooltipContent.displayName = "CenteredTooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, CenteredTooltipContent, TooltipProvider }