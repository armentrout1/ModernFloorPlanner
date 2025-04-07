import React from 'react';
import { SquareIcon, MoveIcon } from 'lucide-react';

interface SidebarProps {
  activeTool: string;
  onSelectTool: (tool: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTool, onSelectTool }) => {
  return (
    <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 hidden sm:flex">
      <div className="mb-4">
        <button
          className={`w-10 h-10 rounded-md flex items-center justify-center transition-colors duration-150 ${
            activeTool === 'room' 
              ? 'bg-primary text-white' 
              : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200'
          }`}
          onClick={() => onSelectTool('room')}
          title="Room (Draw)"
        >
          <SquareIcon className="h-5 w-5" />
        </button>
      </div>
      <div>
        <button
          className={`w-10 h-10 rounded-md flex items-center justify-center transition-colors duration-150 ${
            activeTool === 'move' 
              ? 'bg-primary text-white' 
              : 'text-slate-600 hover:bg-slate-100 active:bg-slate-200'
          }`}
          onClick={() => onSelectTool('move')}
          title="Move"
        >
          <MoveIcon className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
