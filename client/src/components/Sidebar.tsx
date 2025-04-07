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
                <Button
                  variant={activeTool === 'room' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start w-full"
                  onClick={() => onSelectTool('room')}
                >
                  <Square className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Room</span>
                </Button>
                <Button
                  variant={activeTool === 'move' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start w-full"
                  onClick={() => onSelectTool('move')}
                >
                  <Move className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Move</span>
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="objects">
            <AccordionTrigger className="px-2 py-2 text-sm">Room Objects</AccordionTrigger>
            <AccordionContent className="pt-2 pb-2">
              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant={activeTool === 'door' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start w-full"
                  onClick={() => onSelectTool('door')}
                >
                  <DoorOpenIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Door</span>
                </Button>
                <Button
                  variant={activeTool === 'window' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start w-full"
                  onClick={() => onSelectTool('window')}
                >
                  <WindowIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Window</span>
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="align">
            <AccordionTrigger className="px-2 py-2 text-sm">Room Alignment</AccordionTrigger>
            <AccordionContent className="pt-2 pb-2">
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('auto-align')}
                >
                  <LayoutTemplate className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Auto-align Rooms</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('distribute-horizontal')}
                >
                  <ChevronsLeftRight className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Distribute Horizontally</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('distribute-vertical')}
                >
                  <ChevronsUpDown className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Distribute Vertically</span>
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="transform">
            <AccordionTrigger className="px-2 py-2 text-sm">Room Transform</AccordionTrigger>
            <AccordionContent className="pt-2 pb-2">
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('mirror-horizontal')}
                >
                  <FlipHorizontal className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Mirror Horizontally</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('mirror-vertical')}
                >
                  <FlipVertical className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Mirror Vertically</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onApplyAction('center-room')}
                >
                  <LayoutGrid className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Center in View</span>
                </Button>
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
  );
};

export default Sidebar;