import React, { useState } from 'react';
import { Room, ResizeHandle } from '@/utils/types';
import { formatDimensions, calculateRoomArea, formatArea } from '@/utils/canvas';
import RoomLabel from './RoomLabel';

interface RoomBoxProps {
  room: Room;
  isSelected: boolean;
  onSelect: (roomId: string) => void;
  onResizeStart: (roomId: string, handle: ResizeHandle) => void;
  onMoveStart: (roomId: string, clientX: number, clientY: number) => void;
  onUpdateRoom: (roomId: string, updates: Partial<Room>) => void;
  scale: number;
}

const RoomBox: React.FC<RoomBoxProps> = ({
  room,
  isSelected,
  onSelect,
  onResizeStart,
  onMoveStart,
  onUpdateRoom,
  scale,
}) => {
  const { id, x, y, width, height, name = 'Room', color = '#93c5fd' } = room;
  const [isEditingName, setIsEditingName] = useState(false);
  const roomArea = calculateRoomArea(room);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(id);
  };

  const handleMoveStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMoveStart(id, e.clientX, e.clientY);
  };

  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    onResizeStart(id, handle);
  };

  const handleStartEditName = () => {
    setIsEditingName(true);
  };

  const handleSaveName = (newName: string) => {
    setIsEditingName(false);
    if (newName.trim() !== name) {
      onUpdateRoom(id, { name: newName.trim() || 'Room' });
    }
  };

  const roomStyle: React.CSSProperties = {
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`,
    backgroundColor: `${color}33`, // Add transparency
    borderColor: isSelected ? 'hsl(var(--accent))' : 'hsl(var(--primary))',
    zIndex: isSelected ? 10 : 1,
  };

  const roomClasses = `absolute border-2 cursor-move ${isSelected ? 'bg-accent/20 border-accent' : 'bg-primary/20 border-primary'}`;

  return (
    <div
      className={roomClasses}
      style={roomStyle}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleMoveStart}
    >
      <div className="p-2" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <RoomLabel 
            name={name}
            isEditing={isEditingName}
            onStartEdit={handleStartEditName}
            onSave={handleSaveName}
          />
          <span className="text-xs text-slate-500">{formatArea(roomArea)}</span>
        </div>
        <div 
          className="text-sm text-slate-600 font-medium bg-white/70 px-1.5 py-0.5 rounded-sm inline-block"
          onMouseDown={handleMoveStart}
        >
          {formatDimensions(width, height)}
        </div>
      </div>

      {/* Width dimension on top */}
      <div className="absolute top-0 left-0 w-full flex justify-center -translate-y-5 pointer-events-none">
        <div className="text-xs px-1 py-0.5 bg-white/80 rounded shadow-sm">
          {formatDimensions(width, 0).split('×')[0].trim()}
        </div>
      </div>

      {/* Height dimension on right */}
      <div className="absolute top-0 right-0 h-full flex items-center translate-x-5 pointer-events-none">
        <div className="text-xs px-1 py-0.5 bg-white/80 rounded shadow-sm -rotate-90 origin-left">
          {formatDimensions(0, height).split('×')[1].trim()}
        </div>
      </div>

      {/* Resize handles */}
      <div
        className="absolute w-2.5 h-2.5 bg-white border-2 border-primary rounded-full -top-1.5 -left-1.5 cursor-nwse-resize"
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
      />
      <div
        className="absolute w-2.5 h-2.5 bg-white border-2 border-primary rounded-full -top-1.5 -right-1.5 cursor-nesw-resize"
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
      />
      <div
        className="absolute w-2.5 h-2.5 bg-white border-2 border-primary rounded-full -bottom-1.5 -left-1.5 cursor-nesw-resize"
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
      />
      <div
        className="absolute w-2.5 h-2.5 bg-white border-2 border-primary rounded-full -bottom-1.5 -right-1.5 cursor-nwse-resize"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
      />
    </div>
  );
};

export default RoomBox;
