import React from 'react';
import { 
  Square,
  Move,
  DoorOpenIcon,
  Square as WindowIcon,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  FlipHorizontal,
  FlipVertical,
  LayoutGrid,
  ChevronsLeftRight,
  ChevronsUpDown,
  LayoutTemplate
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarProps {
  activeTool: string;
  onSelectTool: (tool: string) => void;
  onApplyAction: (action: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTool,
  onSelectTool,
  onApplyAction,
}) => {
  return (
    <TooltipProvider>
      <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-medium">Tools</h2>
        </div>
        
        <div className="p-3">
          <Accordion type="multiple" defaultValue={['drawing', 'objects', 'align']}>
            <AccordionItem value="drawing">
              <AccordionTrigger className="px-2 py-2 text-sm">Drawing Tools</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="grid grid-cols-1 gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeTool === 'room' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start w-full"
                        onClick={() => onSelectTool('room')}
                      >
                        <Square className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Room</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Draw room (R)</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeTool === 'move' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start w-full"
                        onClick={() => onSelectTool('move')}
                      >
                        <Move className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Move</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Select and move (M)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="objects">
              <AccordionTrigger className="px-2 py-2 text-sm">Room Objects</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="grid grid-cols-1 gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeTool === 'door' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start w-full"
                        onClick={() => onSelectTool('door')}
                      >
                        <DoorOpenIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Door</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Add door to room (D)</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeTool === 'window' ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start w-full"
                        onClick={() => onSelectTool('window')}
                      >
                        <WindowIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Window</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Add window to room (W)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="align">
              <AccordionTrigger className="px-2 py-2 text-sm">Room Alignment</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="space-y-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('auto-align')}
                      >
                        <LayoutTemplate className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Auto-align</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Auto-align selected rooms</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('distribute-horizontal')}
                      >
                        <ChevronsLeftRight className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Dist. Horizontal</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Distribute rooms horizontally</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('distribute-vertical')}
                      >
                        <ChevronsUpDown className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Dist. Vertical</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Distribute rooms vertically</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="transform">
              <AccordionTrigger className="px-2 py-2 text-sm">Room Transform</AccordionTrigger>
              <AccordionContent className="pt-2 pb-2">
                <div className="space-y-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('mirror-horizontal')}
                      >
                        <FlipHorizontal className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Mirror H</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Mirror room horizontally</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('mirror-vertical')}
                      >
                        <FlipVertical className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Mirror V</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Mirror room vertically</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onApplyAction('center-room')}
                      >
                        <LayoutGrid className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">Center</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Center room in viewport</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        
        <div className="mt-auto p-3 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            <p>Tip: Use the door and window tools to add openings to your rooms.</p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Sidebar;